/**
 * Performance Reporter and Visualization Utilities
 *
 * Provides comprehensive performance reporting, visualization, and analysis
 * capabilities for PostgreSQL Schema Sync performance benchmarks.
 */

import * as fs from 'fs';
import * as path from 'path';
import { PerformanceMetrics, BenchmarkResult, PerformanceMetric } from '../../src/utils/PerformanceMetrics';
import { PerformanceMonitor, PerformanceAlert } from '../../src/services/PerformanceMonitor';

export interface PerformanceReport {
    title: string;
    timestamp: number;
    summary: {
        totalBenchmarks: number;
        totalOperations: number;
        averagePerformance: number;
        memoryEfficiency: number;
        successRate: number;
    };
    benchmarks: BenchmarkResult[];
    trends: PerformanceTrend[];
    recommendations: string[];
    alerts: PerformanceAlert[];
}

export interface PerformanceTrend {
    operation: string;
    direction: 'improving' | 'degrading' | 'stable';
    changePercent: number;
    timeframe: string;
    dataPoints: number;
}

export interface PerformanceVisualization {
    type: 'chart' | 'table' | 'summary' | 'trend';
    title: string;
    data: any;
    format: 'text' | 'json' | 'html' | 'markdown';
}

export class PerformanceReporter {
    private static instance: PerformanceReporter;
    private outputDirectory: string;
    private performanceMetrics: PerformanceMetrics;
    private performanceMonitor: PerformanceMonitor;

    private constructor(outputDirectory: string = './performance-reports') {
        this.outputDirectory = outputDirectory;
        this.performanceMetrics = PerformanceMetrics.getInstance();
        this.performanceMonitor = PerformanceMonitor.getInstance();
        this.ensureOutputDirectory();
    }

    static getInstance(outputDirectory?: string): PerformanceReporter {
        if (!PerformanceReporter.instance) {
            PerformanceReporter.instance = new PerformanceReporter(outputDirectory);
        }
        return PerformanceReporter.instance;
    }

    /**
     * Generate comprehensive performance report
     */
    generateReport(
        title: string = 'PostgreSQL Schema Sync Performance Report',
        includeCharts: boolean = true,
        includeTrends: boolean = true,
        includeRecommendations: boolean = true
    ): PerformanceReport {
        const benchmarks = this.getAllBenchmarkResults();
        const trends = includeTrends ? this.analyzeTrends() : [];
        const recommendations = includeRecommendations ? this.generateRecommendations(benchmarks) : [];
        const alerts = this.performanceMonitor.getRecentAlerts(100);

        const report: PerformanceReport = {
            title,
            timestamp: Date.now(),
            summary: this.generateSummary(benchmarks),
            benchmarks,
            trends,
            recommendations,
            alerts
        };

        return report;
    }

    /**
     * Generate and save performance report to file
     */
    async saveReport(
        report: PerformanceReport,
        format: 'json' | 'html' | 'markdown' | 'text' = 'json',
        filename?: string
    ): Promise<string> {
        const timestamp = new Date(report.timestamp).toISOString().replace(/[:.]/g, '-');
        const defaultFilename = `performance-report-${timestamp}.${format}`;
        const outputPath = path.join(this.outputDirectory, filename || defaultFilename);

        let content: string;

        switch (format) {
            case 'json':
                content = JSON.stringify(report, null, 2);
                break;
            case 'html':
                content = this.generateHTMLReport(report);
                break;
            case 'markdown':
                content = this.generateMarkdownReport(report);
                break;
            case 'text':
                content = this.generateTextReport(report);
                break;
            default:
                throw new Error(`Unsupported format: ${format}`);
        }

        await fs.promises.writeFile(outputPath, content, 'utf-8');

        console.log(`📋 Performance report saved to: ${outputPath}`);

        return outputPath;
    }

    /**
     * Generate performance dashboard data
     */
    generateDashboardData(): {
        summary: any;
        charts: PerformanceVisualization[];
        metrics: any;
        alerts: any;
    } {
        const summary = this.performanceMonitor.getPerformanceSummary(24); // Last 24 hours
        const benchmarks = this.getAllBenchmarkResults();

        const dashboardData = {
            summary: {
                totalOperations: summary.totalOperations,
                averageResponseTime: summary.averageResponseTime,
                memoryUsage: {
                    average: Math.round(summary.memoryUsage.average.heapUsed / 1024 / 1024),
                    peak: Math.round(summary.memoryUsage.peak.heapUsed / 1024 / 1024),
                    unit: 'MB'
                },
                alertsCount: summary.alertsCount,
                trends: summary.trends
            },
            charts: this.generateCharts(benchmarks),
            metrics: this.generateMetricsTable(benchmarks),
            alerts: this.performanceMonitor.getRecentAlerts(10)
        };

        return dashboardData;
    }

    /**
     * Compare performance between two time periods
     */
    comparePerformancePeriods(
        period1Start: number,
        period1End: number,
        period2Start: number,
        period2End: number
    ): {
        period1: { benchmarks: BenchmarkResult[]; summary: any };
        period2: { benchmarks: BenchmarkResult[]; summary: any };
        comparison: {
            performanceChange: number;
            memoryChange: number;
            reliabilityChange: number;
            recommendations: string[];
        };
    } {
        const period1Benchmarks = this.getBenchmarkResultsInRange(period1Start, period1End);
        const period2Benchmarks = this.getBenchmarkResultsInRange(period2Start, period2End);

        const period1Summary = this.generateSummary(period1Benchmarks);
        const period2Summary = this.generateSummary(period2Benchmarks);

        // Calculate changes
        const performanceChange = this.calculatePercentChange(
            period1Summary.averagePerformance,
            period2Summary.averagePerformance
        );

        const memoryChange = this.calculatePercentChange(
            period1Summary.memoryEfficiency,
            period2Summary.memoryEfficiency
        );

        const reliabilityChange = this.calculatePercentChange(
            period1Summary.successRate,
            period2Summary.successRate
        );

        const recommendations = this.generateComparisonRecommendations(
            performanceChange,
            memoryChange,
            reliabilityChange
        );

        return {
            period1: { benchmarks: period1Benchmarks, summary: period1Summary },
            period2: { benchmarks: period2Benchmarks, summary: period2Summary },
            comparison: {
                performanceChange,
                memoryChange,
                reliabilityChange,
                recommendations
            }
        };
    }

    /**
     * Generate performance regression report
     */
    generateRegressionReport(threshold: number = 10): {
        regressions: Array<{
            operation: string;
            changePercent: number;
            severity: 'low' | 'medium' | 'high' | 'critical';
            details: string;
        }>;
        improvements: Array<{
            operation: string;
            changePercent: number;
            details: string;
        }>;
        summary: string;
    } {
        const trends = this.analyzeTrends();
        const regressions: any[] = [];
        const improvements: any[] = [];

        trends.forEach(trend => {
            if (trend.direction === 'degrading' && Math.abs(trend.changePercent) >= threshold) {
                regressions.push({
                    operation: trend.operation,
                    changePercent: trend.changePercent,
                    severity: this.classifyRegressionSeverity(trend.changePercent),
                    details: `Performance degraded by ${Math.abs(trend.changePercent).toFixed(2)}% over ${trend.timeframe} (${trend.dataPoints} data points)`
                });
            } else if (trend.direction === 'improving' && trend.changePercent <= -threshold) {
                improvements.push({
                    operation: trend.operation,
                    changePercent: trend.changePercent,
                    details: `Performance improved by ${Math.abs(trend.changePercent).toFixed(2)}% over ${trend.timeframe} (${trend.dataPoints} data points)`
                });
            }
        });

        const summary = this.generateRegressionSummary(regressions, improvements);

        return {
            regressions,
            improvements,
            summary
        };
    }

    /**
     * Export performance data for external analysis
     */
    exportPerformanceData(format: 'csv' | 'json' | 'xml' = 'json'): string {
        const benchmarks = this.getAllBenchmarkResults();
        const metrics = this.performanceMetrics.getAllMetrics();

        const exportData = {
            metadata: {
                exportTimestamp: new Date().toISOString(),
                totalBenchmarks: benchmarks.length,
                totalMetrics: metrics.length,
                format
            },
            benchmarks,
            metrics
        };

        switch (format) {
            case 'csv':
                return this.convertToCSV(exportData);
            case 'xml':
                return this.convertToXML(exportData);
            case 'json':
            default:
                return JSON.stringify(exportData, null, 2);
        }
    }

    private generateSummary(benchmarks: BenchmarkResult[]): {
        totalBenchmarks: number;
        totalOperations: number;
        averagePerformance: number;
        memoryEfficiency: number;
        successRate: number;
    } {
        if (benchmarks.length === 0) {
            return {
                totalBenchmarks: 0,
                totalOperations: 0,
                averagePerformance: 0,
                memoryEfficiency: 0,
                successRate: 0
            };
        }

        const totalOperations = benchmarks.reduce((sum, b) => sum + b.iterations, 0);
        const averagePerformance = benchmarks.reduce((sum, b) => sum + b.averageDuration, 0) / benchmarks.length;
        const successfulBenchmarks = benchmarks.filter(b => b.success).length;
        const successRate = (successfulBenchmarks / benchmarks.length) * 100;

        // Calculate memory efficiency (operations per MB)
        const totalMemoryUsage = benchmarks.reduce((sum, b) => {
            return sum + (b.memoryUsage.average.heapUsed / 1024 / 1024); // Convert to MB
        }, 0);
        const memoryEfficiency = totalOperations / Math.max(totalMemoryUsage, 1);

        return {
            totalBenchmarks: benchmarks.length,
            totalOperations,
            averagePerformance,
            memoryEfficiency,
            successRate
        };
    }

    private analyzeTrends(): PerformanceTrend[] {
        const trends: PerformanceTrend[] = [];
        const benchmarks = this.getAllBenchmarkResults();

        // Group benchmarks by operation
        const operationGroups = new Map<string, BenchmarkResult[]>();
        benchmarks.forEach(benchmark => {
            if (!operationGroups.has(benchmark.name)) {
                operationGroups.set(benchmark.name, []);
            }
            operationGroups.get(benchmark.name)!.push(benchmark);
        });

        // Analyze trends for each operation
        operationGroups.forEach((operationBenchmarks, operationName) => {
            if (operationBenchmarks.length >= 2) {
                // Sort by timestamp
                operationBenchmarks.sort((a, b) => a.timestamp - b.timestamp);

                // Compare first half with second half
                const midPoint = Math.floor(operationBenchmarks.length / 2);
                const firstHalf = operationBenchmarks.slice(0, midPoint);
                const secondHalf = operationBenchmarks.slice(midPoint);

                if (firstHalf.length > 0 && secondHalf.length > 0) {
                    const firstHalfAvg = firstHalf.reduce((sum, b) => sum + b.averageDuration, 0) / firstHalf.length;
                    const secondHalfAvg = secondHalf.reduce((sum, b) => sum + b.averageDuration, 0) / secondHalf.length;

                    const changePercent = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;

                    let direction: 'improving' | 'degrading' | 'stable' = 'stable';
                    if (Math.abs(changePercent) > 5) { // 5% threshold
                        direction = changePercent > 0 ? 'degrading' : 'improving';
                    }

                    const timeSpan = (operationBenchmarks[operationBenchmarks.length - 1].timestamp -
                                    operationBenchmarks[0].timestamp) / (1000 * 60 * 60); // hours

                    trends.push({
                        operation: operationName,
                        direction,
                        changePercent,
                        timeframe: `${timeSpan.toFixed(1)}h`,
                        dataPoints: operationBenchmarks.length
                    });
                }
            }
        });

        return trends;
    }

    private generateRecommendations(benchmarks: BenchmarkResult[]): string[] {
        const recommendations: string[] = [];

        // Analyze performance patterns
        const slowOperations = benchmarks.filter(b => b.averageDuration > 10000); // > 10 seconds
        const memoryIntensive = benchmarks.filter(b => {
            const memoryMB = b.memoryUsage.average.heapUsed / 1024 / 1024;
            return memoryMB > 100; // > 100MB
        });
        const failedBenchmarks = benchmarks.filter(b => !b.success);

        if (slowOperations.length > 0) {
            recommendations.push(
                `Consider optimizing ${slowOperations.length} slow operations ` +
                `(>${Math.max(...slowOperations.map(b => b.averageDuration)) / 1000}s threshold)`
            );
        }

        if (memoryIntensive.length > 0) {
            recommendations.push(
                `Review memory usage for ${memoryIntensive.length} memory-intensive operations ` +
                `(>${Math.max(...memoryIntensive.map(b => b.memoryUsage.average.heapUsed / 1024 / 1024)).toFixed(0)}MB peak)`
            );
        }

        if (failedBenchmarks.length > 0) {
            recommendations.push(
                `Investigate ${failedBenchmarks.length} failed benchmark(s) to ensure reliability`
            );
        }

        // General recommendations
        const successRate = (benchmarks.filter(b => b.success).length / benchmarks.length) * 100;
        if (successRate < 95) {
            recommendations.push('Focus on improving benchmark reliability (current success rate: ${successRate.toFixed(1)}%)');
        }

        if (recommendations.length === 0) {
            recommendations.push('Performance looks good! Continue monitoring for any degradation.');
        }

        return recommendations;
    }

    private generateCharts(benchmarks: BenchmarkResult[]): PerformanceVisualization[] {
        const charts: PerformanceVisualization[] = [];

        // Performance distribution chart
        charts.push({
            type: 'chart',
            title: 'Performance Distribution',
            data: {
                labels: benchmarks.map(b => b.name),
                datasets: [{
                    label: 'Average Duration (ms)',
                    data: benchmarks.map(b => b.averageDuration),
                    backgroundColor: benchmarks.map(b =>
                        b.averageDuration > 10000 ? '#ff6b6b' :
                        b.averageDuration > 5000 ? '#ffa726' : '#66bb6a'
                    )
                }]
            },
            format: 'json'
        });

        // Memory usage chart
        charts.push({
            type: 'chart',
            title: 'Memory Usage',
            data: {
                labels: benchmarks.map(b => b.name),
                datasets: [{
                    label: 'Memory Usage (MB)',
                    data: benchmarks.map(b => Math.round(b.memoryUsage.average.heapUsed / 1024 / 1024))
                }]
            },
            format: 'json'
        });

        return charts;
    }

    private generateMetricsTable(benchmarks: BenchmarkResult[]): any {
        return {
            headers: ['Operation', 'Iterations', 'Avg Duration', 'Memory Usage', 'Success Rate'],
            rows: benchmarks.map(benchmark => [
                benchmark.name,
                benchmark.iterations.toString(),
                `${benchmark.averageDuration.toFixed(2)}ms`,
                `${Math.round(benchmark.memoryUsage.average.heapUsed / 1024 / 1024)}MB`,
                benchmark.success ? '100%' : '0%'
            ])
        };
    }

    private generateHTMLReport(report: PerformanceReport): string {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${report.title}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .metric-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .metric-value { font-size: 2em; font-weight: bold; color: #2563eb; }
        .metric-label { color: #6b7280; font-size: 0.9em; }
        .section { margin-bottom: 40px; }
        .section h2 { color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
        .alert { padding: 10px; margin: 10px 0; border-radius: 4px; }
        .alert.warning { background: #fef3c7; border-left: 4px solid #f59e0b; }
        .alert.critical { background: #fee2e2; border-left: 4px solid #ef4444; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
        th { background: #f9fafb; font-weight: 600; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${report.title}</h1>
        <p>Generated: ${new Date(report.timestamp).toLocaleString()}</p>
    </div>

    <div class="summary">
        <div class="metric-card">
            <div class="metric-value">${report.summary.totalBenchmarks}</div>
            <div class="metric-label">Total Benchmarks</div>
        </div>
        <div class="metric-card">
            <div class="metric-value">${report.summary.averagePerformance.toFixed(0)}ms</div>
            <div class="metric-label">Avg Performance</div>
        </div>
        <div class="metric-card">
            <div class="metric-value">${report.summary.memoryEfficiency.toFixed(1)}</div>
            <div class="metric-label">Memory Efficiency</div>
        </div>
        <div class="metric-card">
            <div class="metric-value">${report.summary.successRate.toFixed(1)}%</div>
            <div class="metric-label">Success Rate</div>
        </div>
    </div>

    ${report.alerts.length > 0 ? `
    <div class="section">
        <h2>Recent Alerts</h2>
        ${report.alerts.map(alert => `
            <div class="alert ${alert.level}">
                <strong>${alert.level}:</strong> ${alert.message}
                <br><small>${new Date(alert.timestamp).toLocaleString()}</small>
            </div>
        `).join('')}
    </div>
    ` : ''}

    <div class="section">
        <h2>Performance Trends</h2>
        ${report.trends.length > 0 ? `
            <table>
                <thead>
                    <tr>
                        <th>Operation</th>
                        <th>Trend</th>
                        <th>Change</th>
                        <th>Timeframe</th>
                    </tr>
                </thead>
                <tbody>
                    ${report.trends.map(trend => `
                        <tr>
                            <td>${trend.operation}</td>
                            <td>${trend.direction}</td>
                            <td>${trend.changePercent > 0 ? '+' : ''}${trend.changePercent.toFixed(2)}%</td>
                            <td>${trend.timeframe}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        ` : '<p>No trend data available</p>'}
    </div>

    <div class="section">
        <h2>Recommendations</h2>
        <ul>
            ${report.recommendations.map(rec => `<li>${rec}</li>`).join('')}
        </ul>
    </div>
</body>
</html>`;
    }

    private generateMarkdownReport(report: PerformanceReport): string {
        return `# ${report.title}

Generated: ${new Date(report.timestamp).toLocaleString()}

## Summary

- **Total Benchmarks:** ${report.summary.totalBenchmarks}
- **Average Performance:** ${report.summary.averagePerformance.toFixed(0)}ms
- **Memory Efficiency:** ${report.summary.memoryEfficiency.toFixed(1)}
- **Success Rate:** ${report.summary.successRate.toFixed(1)}%

## Recent Alerts

${report.alerts.length > 0 ? report.alerts.map(alert =>
    `- **${alert.level}:** ${alert.message} (${new Date(alert.timestamp).toLocaleString()})`
).join('\n') : 'No recent alerts'}

## Performance Trends

${report.trends.length > 0 ? `
| Operation | Trend | Change | Timeframe |
|-----------|-------|--------|-----------|
${report.trends.map(trend =>
    `| ${trend.operation} | ${trend.direction} | ${trend.changePercent > 0 ? '+' : ''}${trend.changePercent.toFixed(2)}% | ${trend.timeframe} |`
).join('\n')}
` : 'No trend data available'}

## Recommendations

${report.recommendations.map(rec => `- ${rec}`).join('\n')}

---

*Report generated by PostgreSQL Schema Sync Performance Reporter*
`;
    }

    private generateTextReport(report: PerformanceReport): string {
        return `POSTGRESQL SCHEMA SYNC PERFORMANCE REPORT
==========================================

Generated: ${new Date(report.timestamp).toLocaleString()}

SUMMARY
-------
Total Benchmarks: ${report.summary.totalBenchmarks}
Average Performance: ${report.summary.averagePerformance.toFixed(0)}ms
Memory Efficiency: ${report.summary.memoryEfficiency.toFixed(1)}
Success Rate: ${report.summary.successRate.toFixed(1)}%

RECENT ALERTS
-------------
${report.alerts.length > 0 ? report.alerts.map(alert =>
    `${alert.level}: ${alert.message} (${new Date(alert.timestamp).toLocaleString()})`
).join('\n') : 'No recent alerts'}

PERFORMANCE TRENDS
------------------
${report.trends.length > 0 ? report.trends.map(trend =>
    `${trend.operation}: ${trend.direction} (${trend.changePercent > 0 ? '+' : ''}${trend.changePercent.toFixed(2)}% over ${trend.timeframe})`
).join('\n') : 'No trend data available'}

RECOMMENDATIONS
---------------
${report.recommendations.map(rec => `- ${rec}`).join('\n')}

Report generated by PostgreSQL Schema Sync Performance Reporter
`;
    }

    private getAllBenchmarkResults(): BenchmarkResult[] {
        // In a real implementation, this would retrieve from storage
        // For now, return empty array as this is a demonstration
        return [];
    }

    private getBenchmarkResultsInRange(startTime: number, endTime: number): BenchmarkResult[] {
        // In a real implementation, this would filter by timestamp range
        return [];
    }

    private calculatePercentChange(oldValue: number, newValue: number): number {
        if (oldValue === 0) return newValue > 0 ? 100 : 0;
        return ((newValue - oldValue) / oldValue) * 100;
    }

    private generateComparisonRecommendations(
        performanceChange: number,
        memoryChange: number,
        reliabilityChange: number
    ): string[] {
        const recommendations: string[] = [];

        if (performanceChange > 10) {
            recommendations.push('Performance has degraded significantly - investigate recent changes');
        } else if (performanceChange < -10) {
            recommendations.push('Performance has improved - consider applying optimizations more broadly');
        }

        if (memoryChange > 20) {
            recommendations.push('Memory usage has increased - review for potential memory leaks');
        } else if (memoryChange < -20) {
            recommendations.push('Memory efficiency has improved - good optimization work!');
        }

        if (reliabilityChange < -5) {
            recommendations.push('Reliability has decreased - focus on stability improvements');
        }

        return recommendations;
    }

    private classifyRegressionSeverity(changePercent: number): 'low' | 'medium' | 'high' | 'critical' {
        const absChange = Math.abs(changePercent);
        if (absChange > 50) return 'critical';
        if (absChange > 25) return 'high';
        if (absChange > 10) return 'medium';
        return 'low';
    }

    private generateRegressionSummary(regressions: any[], improvements: any[]): string {
        const totalRegressions = regressions.length;
        const totalImprovements = improvements.length;

        if (totalRegressions === 0 && totalImprovements === 0) {
            return 'No significant performance changes detected.';
        }

        let summary = '';

        if (totalRegressions > 0) {
            const criticalCount = regressions.filter(r => r.severity === 'critical').length;
            const highCount = regressions.filter(r => r.severity === 'high').length;

            summary += `Found ${totalRegressions} performance regression(s)`;
            if (criticalCount > 0) summary += ` (${criticalCount} critical)`;
            if (highCount > 0) summary += ` (${highCount} high severity)`;
            summary += '. ';
        }

        if (totalImprovements > 0) {
            summary += `Found ${totalImprovements} performance improvement(s). `;
        }

        return summary;
    }

    private convertToCSV(data: any): string {
        // Simple CSV conversion for benchmarks
        const headers = ['name', 'iterations', 'averageDuration', 'success', 'timestamp'];
        const rows = [headers.join(',')];

        if (data.benchmarks) {
            data.benchmarks.forEach((benchmark: BenchmarkResult) => {
                rows.push([
                    benchmark.name,
                    benchmark.iterations.toString(),
                    benchmark.averageDuration.toString(),
                    benchmark.success.toString(),
                    new Date(benchmark.timestamp).toISOString()
                ].join(','));
            });
        }

        return rows.join('\n');
    }

    private convertToXML(data: any): string {
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<performance-report>\n';
        xml += `  <metadata>\n`;
        xml += `    <export-timestamp>${new Date(data.metadata.exportTimestamp).toISOString()}</export-timestamp>\n`;
        xml += `    <total-benchmarks>${data.metadata.totalBenchmarks}</total-benchmarks>\n`;
        xml += `    <total-metrics>${data.metadata.totalMetrics}</total-metrics>\n`;
        xml += `  </metadata>\n`;

        if (data.benchmarks) {
            xml += `  <benchmarks>\n`;
            data.benchmarks.forEach((benchmark: BenchmarkResult) => {
                xml += `    <benchmark>\n`;
                xml += `      <name>${benchmark.name}</name>\n`;
                xml += `      <iterations>${benchmark.iterations}</iterations>\n`;
                xml += `      <average-duration>${benchmark.averageDuration}</average-duration>\n`;
                xml += `      <success>${benchmark.success}</success>\n`;
                xml += `      <timestamp>${new Date(benchmark.timestamp).toISOString()}</timestamp>\n`;
                xml += `    </benchmark>\n`;
            });
            xml += `  </benchmarks>\n`;
        }

        xml += '</performance-report>';
        return xml;
    }

    private ensureOutputDirectory(): void {
        if (!fs.existsSync(this.outputDirectory)) {
            fs.mkdirSync(this.outputDirectory, { recursive: true });
        }
    }
}

/**
 * Helper function to generate and save a quick performance report
 */
export async function generateQuickReport(
    title?: string,
    format: 'json' | 'html' | 'markdown' | 'text' = 'json'
): Promise<string> {
    const reporter = PerformanceReporter.getInstance();
    const report = reporter.generateReport(title);

    return await reporter.saveReport(report, format);
}

/**
 * Helper function to compare performance between two periods
 */
export function comparePerformancePeriodsHelper(
    period1Start: Date,
    period1End: Date,
    period2Start: Date,
    period2End: Date
): any {
    const reporter = PerformanceReporter.getInstance();

    return reporter.comparePerformancePeriods(
        period1Start.getTime(),
        period1End.getTime(),
        period2Start.getTime(),
        period2End.getTime()
    );
}