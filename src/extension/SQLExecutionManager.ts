import * as vscode from 'vscode';
import { ExtensionComponents } from '@/utils/ExtensionInitializer';
import { Logger } from '@/utils/Logger';

/**
 * SQLExecutionManager - Handles SQL execution logic and performance monitoring
 * Extracted from the monolithic extension.ts for better organization
 */

// Query execution state interface
interface QueryExecutionState {
    isExecuting: boolean;
    currentStatement: number;
    totalStatements: number;
    startTime: number;
    progressItem: vscode.Progress<{ message?: string; increment?: number; }> | null;
    executionResults: Array<{ statement: string; success: boolean; duration: number; error?: string; }>;
}

// Performance metrics interface
interface PerformanceMetrics {
    fileOperations: number;
    connectionChecks: number;
    schemaChecks: number;
    queryExecutions: number;
    averageResponseTime: number;
    lastResetTime: number;
}

// Global state (would be better as dependency injection in a real refactor)
let queryExecutionState: QueryExecutionState = {
    isExecuting: false,
    currentStatement: 0,
    totalStatements: 0,
    startTime: 0,
    progressItem: null,
    executionResults: []
};

let performanceMetrics: PerformanceMetrics = {
    fileOperations: 0,
    connectionChecks: 0,
    schemaChecks: 0,
    queryExecutions: 0,
    averageResponseTime: 0,
    lastResetTime: Date.now()
};

/**
 * Execute SQL content from a file or editor
 */
export async function executeSQLContent(
    sqlContent: string,
    connectionId: string,
    components?: ExtensionComponents
): Promise<void> {
    if (queryExecutionState.isExecuting) {
        vscode.window.showWarningMessage('A query execution is already in progress. Please wait for it to complete.');
        return;
    }

    try {
        Logger.info('Executing SQL content from file', 'executeSQLContent', {
            connectionId,
            contentLength: sqlContent.length
        });

        const queryExecutionService = components?.queryExecutionService;
        if (!queryExecutionService) {
            throw new Error('Query execution service not available');
        }

        const statements = sqlContent.split(';').filter(stmt => stmt.trim().length > 0);

        if (statements.length === 0) {
            vscode.window.showWarningMessage('No valid SQL statements found in file');
            return;
        }

        // Initialize execution state
        queryExecutionState.isExecuting = true;
        queryExecutionState.currentStatement = 0;
        queryExecutionState.totalStatements = statements.length;
        queryExecutionState.startTime = Date.now();
        queryExecutionState.executionResults = [];

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Executing SQL',
            cancellable: true
        }, async (progress, token) => {
            queryExecutionState.progressItem = progress;

            token.onCancellationRequested(() => {
                Logger.info('SQL execution cancelled by user', 'executeSQLContent');
                queryExecutionState.isExecuting = false;
                vscode.window.showInformationMessage('SQL execution cancelled');
            });

            let successCount = 0;
            let errorCount = 0;

            for (let i = 0; i < statements.length; i++) {
                if (!queryExecutionState.isExecuting) break;

                const statement = statements[i];
                const trimmedStatement = statement.trim();
                if (trimmedStatement.length === 0) continue;

                queryExecutionState.currentStatement = i + 1;

                const progressPercent = ((i + 1) / statements.length) * 100;
                progress.report({
                    message: `Executing statement ${i + 1} of ${statements.length}...`,
                    increment: (1 / statements.length) * 100
                });

                const statementStartTime = Date.now();

                try {
                    const result = await queryExecutionService.executeQuery(
                        connectionId,
                        trimmedStatement,
                        { timeout: 30000, maxRows: 1000 }
                    );

                    const duration = Date.now() - statementStartTime;

                    if (result.error) {
                        errorCount++;
                        queryExecutionState.executionResults.push({
                            statement: trimmedStatement,
                            success: false,
                            duration,
                            error: result.error
                        });

                        Logger.warn('SQL statement execution failed', 'executeSQLContent', {
                            statement: trimmedStatement.substring(0, 100) + '...',
                            error: result.error,
                            duration: `${duration}ms`
                        });
                    } else {
                        successCount++;
                        queryExecutionState.executionResults.push({
                            statement: trimmedStatement,
                            success: true,
                            duration
                        });

                        Logger.debug('SQL statement executed successfully', 'executeSQLContent', {
                            statement: trimmedStatement.substring(0, 100) + '...',
                            rowCount: result.rowCount,
                            duration: `${duration}ms`
                        });
                    }
                } catch (statementError) {
                    errorCount++;
                    const duration = Date.now() - statementStartTime;

                    queryExecutionState.executionResults.push({
                        statement: trimmedStatement,
                        success: false,
                        duration,
                        error: (statementError as Error).message
                    });

                    Logger.error('SQL statement execution error', statementError as Error);
                }

                await new Promise(resolve => setTimeout(resolve, 100));
            }

            progress.report({ message: 'Execution completed', increment: 100 });
            showExecutionResults(successCount, errorCount, statements.length);
        });

    } catch (error) {
        Logger.error('Failed to execute SQL content', error as Error);
        vscode.window.showErrorMessage(`SQL execution failed: ${(error as Error).message}`);
    } finally {
        queryExecutionState.isExecuting = false;
        queryExecutionState.progressItem = null;
        queryExecutionState.executionResults = [];
    }
}

/**
 * Format SQL content
 */
export async function formatSQL(sqlContent: string): Promise<string> {
    try {
        Logger.info('Formatting SQL content', 'formatSQL', {
            contentLength: sqlContent.length
        });

        let formatted = sqlContent;

        // Normalize whitespace
        formatted = formatted.replace(/\s+/g, ' ');

        // Add newlines after keywords
        formatted = formatted.replace(/\s*(SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\s+/gi, '\n$1 ');
        formatted = formatted.replace(/\s*(INNER JOIN|LEFT JOIN|RIGHT JOIN|FULL JOIN|UNION|UNION ALL)\s+/gi, '\n$1 ');
        formatted = formatted.replace(/\s*(AND|OR)\s+/gi, '\n    $1 ');

        // Format column lists
        formatted = formatted.replace(/\s*,\s*/g, ',\n    ');

        // Clean up excessive newlines
        formatted = formatted.replace(/\n\s*\n/g, '\n');

        return formatted.trim();

    } catch (error) {
        Logger.error('Failed to format SQL', error as Error);
        throw error;
    }
}

/**
 * Show execution results to user
 */
function showExecutionResults(successCount: number, errorCount: number, totalCount: number): void {
    const totalDuration = Date.now() - queryExecutionState.startTime;
    const avgDuration = queryExecutionState.executionResults.length > 0
        ? queryExecutionState.executionResults.reduce((sum, result) => sum + result.duration, 0) / queryExecutionState.executionResults.length
        : 0;

    if (errorCount === 0) {
        vscode.window.showInformationMessage(
            `All SQL statements executed successfully!\n${successCount}/${totalCount} statements completed in ${totalDuration}ms (avg: ${Math.round(avgDuration)}ms)`,
            'View Details', 'View Performance'
        ).then(selection => {
            if (selection === 'View Details') {
                Logger.showOutputChannel();
            } else if (selection === 'View Performance') {
                showPerformanceDetails();
            }
        });
    } else {
        vscode.window.showWarningMessage(
            `SQL execution completed with issues:\n${successCount} succeeded, ${errorCount} failed\nTotal time: ${totalDuration}ms (avg: ${Math.round(avgDuration)}ms)`,
            'View Details', 'View Errors', 'View Performance'
        ).then(selection => {
            if (selection === 'View Details' || selection === 'View Errors') {
                Logger.showOutputChannel();
            } else if (selection === 'View Performance') {
                showPerformanceDetails();
            }
        });
    }
}

/**
 * Show detailed performance information
 */
function showPerformanceDetails(): void {
    try {
        const totalDuration = Date.now() - queryExecutionState.startTime;
        const successfulResults = queryExecutionState.executionResults.filter(r => r.success);
        const failedResults = queryExecutionState.executionResults.filter(r => !r.success);

        const avgDuration = successfulResults.length > 0
            ? successfulResults.reduce((sum, r) => sum + r.duration, 0) / successfulResults.length
            : 0;

        const minDuration = successfulResults.length > 0
            ? Math.min(...successfulResults.map(r => r.duration))
            : 0;

        const maxDuration = successfulResults.length > 0
            ? Math.max(...successfulResults.map(r => r.duration))
            : 0;

        const performanceRating = analyzePerformance(avgDuration, totalDuration);
        const recommendations = generatePerformanceRecommendations(successfulResults, failedResults, avgDuration);

        const details = [
            `=== SQL Execution Performance Report ===`,
            `Generated: ${new Date().toISOString()}`,
            ``,
            `=== EXECUTION SUMMARY ===`,
            `Total Execution Time: ${totalDuration}ms`,
            `Total Statements: ${queryExecutionState.totalStatements}`,
            `Successful: ${successfulResults.length}`,
            `Failed: ${failedResults.length}`,
            `Success Rate: ${queryExecutionState.totalStatements > 0 ? Math.round((successfulResults.length / queryExecutionState.totalStatements) * 100) : 0}%`,
            ``,
            `=== PERFORMANCE METRICS ===`,
            `Average Execution Time: ${Math.round(avgDuration)}ms`,
            `Fastest Statement: ${minDuration}ms`,
            `Slowest Statement: ${maxDuration}ms`,
            `Performance Rating: ${performanceRating.rating} (${performanceRating.description})`,
            ``
        ];

        if (successfulResults.length > 0) {
            details.push(`=== SUCCESSFUL STATEMENTS (${successfulResults.length}) ===`);
            successfulResults
                .sort((a, b) => b.duration - a.duration)
                .forEach((result, index) => {
                    const performanceIndicator = getPerformanceIndicator(result.duration, avgDuration);
                    details.push(`${index + 1}. ${result.duration}ms ${performanceIndicator} - ${result.statement.substring(0, 60)}${result.statement.length > 60 ? '...' : ''}`);
                });
        }

        if (failedResults.length > 0) {
            details.push(``);
            details.push(`=== FAILED STATEMENTS (${failedResults.length}) ===`);
            failedResults.forEach((result, index) => {
                details.push(`${index + 1}. ${result.duration}ms - ERROR: ${result.error}`);
                details.push(`   Statement: ${result.statement.substring(0, 60)}${result.statement.length > 60 ? '...' : ''}`);
                details.push(``);
            });
        }

        if (recommendations.length > 0) {
            details.push(`=== PERFORMANCE RECOMMENDATIONS ===`);
            recommendations.forEach(rec => {
                details.push(`• ${rec}`);
            });
            details.push(``);
        }

        details.push(`=== SYSTEM METRICS ===`);
        details.push(`Global File Operations: ${performanceMetrics.fileOperations}`);
        details.push(`Global Connection Checks: ${performanceMetrics.connectionChecks}`);
        details.push(`Global Query Executions: ${performanceMetrics.queryExecutions}`);
        details.push(`Global Average Response Time: ${Math.round(performanceMetrics.averageResponseTime)}ms`);

        vscode.window.showInformationMessage(
            `Performance Report Generated: ${performanceRating.rating} performance (${Math.round(avgDuration)}ms avg)`,
            'View Report', 'Export Report', 'Copy to Clipboard'
        ).then(selection => {
            switch (selection) {
                case 'View Report':
                    showReportInDocument(details.join('\n'));
                    break;
                case 'Export Report':
                    exportReportToFile(details.join('\n'));
                    break;
                case 'Copy to Clipboard':
                    copyReportToClipboard(details.join('\n'));
                    break;
            }
        });

    } catch (error) {
        Logger.error('Error generating performance details', error as Error);
        vscode.window.showErrorMessage(`Failed to generate performance report: ${(error as Error).message}`);
    }
}

/**
 * Analyze performance and return rating
 */
function analyzePerformance(avgDuration: number, totalDuration: number): { rating: string; description: string; } {
    const avgRating = getAverageDurationRating(avgDuration);
    const totalRating = getTotalDurationRating(totalDuration);

    if (avgRating.severity > totalRating.severity) {
        return {
            rating: avgRating.rating,
            description: `${avgRating.description} (based on ${Math.round(avgDuration)}ms average per query)`
        };
    } else {
        return {
            rating: totalRating.rating,
            description: `${totalRating.description} (total: ${totalDuration}ms for all queries)`
        };
    }
}

/**
 * Get performance indicator emoji
 */
function getPerformanceIndicator(duration: number, avgDuration: number): string {
    const ratio = duration / avgDuration;
    if (ratio < 0.5) return '⚡';
    if (ratio < 0.8) return '🚀';
    if (ratio < 1.2) return '✅';
    if (ratio < 2.0) return '⚠️';
    return '🐌';
}

/**
 * Generate performance recommendations
 */
function generatePerformanceRecommendations(
    successfulResults: Array<{ statement: string; success: boolean; duration: number; error?: string; }>,
    failedResults: Array<{ statement: string; success: boolean; duration: number; error?: string; }>,
    avgDuration: number
): string[] {
    const recommendations: string[] = [];

    const slowQueries = successfulResults.filter(r => r.duration > avgDuration * 2);
    if (slowQueries.length > 0) {
        recommendations.push(`${slowQueries.length} queries are significantly slower than average - consider adding indexes`);
    }

    if (failedResults.length > 0) {
        const syntaxErrors = failedResults.filter(r => r.error?.toLowerCase().includes('syntax')).length;
        if (syntaxErrors > 0) {
            recommendations.push(`${syntaxErrors} syntax errors found - check SQL syntax`);
        }

        const connectionErrors = failedResults.filter(r => r.error?.toLowerCase().includes('connection')).length;
        if (connectionErrors > 0) {
            recommendations.push(`${connectionErrors} connection errors - verify database connectivity`);
        }
    }

    if (avgDuration > 500) {
        recommendations.push('Consider optimizing queries or adding database indexes');
    }

    if (successfulResults.length > 10) {
        recommendations.push('Large number of statements - consider batch optimization');
    }

    return recommendations;
}

/**
 * Show report in a new document
 */
async function showReportInDocument(reportContent: string): Promise<void> {
    try {
        const document = await vscode.workspace.openTextDocument({
            content: reportContent,
            language: 'log'
        });

        await vscode.window.showTextDocument(document, {
            preview: true,
            preserveFocus: false,
            viewColumn: vscode.ViewColumn.Beside
        });

        vscode.window.showInformationMessage('Performance report opened in new tab');
    } catch (error) {
        Logger.error('Error showing report in document', error as Error);
        vscode.window.showErrorMessage(`Failed to open report: ${(error as Error).message}`);
    }
}

/**
 * Export report to file
 */
async function exportReportToFile(reportContent: string): Promise<void> {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`postgresql-performance-report-${timestamp}.txt`),
            filters: {
                'Text Files': ['txt'],
                'Log Files': ['log'],
                'All Files': ['*']
            },
            title: 'Export Performance Report'
        });

        if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(reportContent, 'utf8'));
            vscode.window.showInformationMessage(`Performance report exported to ${uri.fsPath}`);
        }
    } catch (error) {
        Logger.error('Error exporting report to file', error as Error);
        vscode.window.showErrorMessage(`Failed to export report: ${(error as Error).message}`);
    }
}

/**
 * Copy report to clipboard
 */
async function copyReportToClipboard(reportContent: string): Promise<void> {
    try {
        await vscode.env.clipboard.writeText(reportContent);
        vscode.window.showInformationMessage('Performance report copied to clipboard');
    } catch (error) {
        Logger.error('Error copying report to clipboard', error as Error);
        vscode.window.showErrorMessage(`Failed to copy report: ${(error as Error).message}`);
    }
}

/**
 * Get average duration rating
 */
function getAverageDurationRating(avgDuration: number): { rating: string; description: string; severity: number; } {
    if (avgDuration < 50) {
        return { rating: 'Excellent', description: 'Very fast individual query performance', severity: 1 };
    } else if (avgDuration < 150) {
        return { rating: 'Good', description: 'Fast individual query performance', severity: 2 };
    } else if (avgDuration < 500) {
        return { rating: 'Moderate', description: 'Acceptable individual query performance', severity: 3 };
    } else if (avgDuration < 1000) {
        return { rating: 'Slow', description: 'Slow individual query performance', severity: 4 };
    } else {
        return { rating: 'Very Slow', description: 'Very slow individual query performance', severity: 5 };
    }
}

/**
 * Get total duration rating
 */
function getTotalDurationRating(totalDuration: number): { rating: string; description: string; severity: number; } {
    if (totalDuration < 100) {
        return { rating: 'Excellent', description: 'Very fast overall execution', severity: 1 };
    } else if (totalDuration < 500) {
        return { rating: 'Good', description: 'Fast overall execution', severity: 2 };
    } else if (totalDuration < 2000) {
        return { rating: 'Moderate', description: 'Acceptable overall execution time', severity: 3 };
    } else if (totalDuration < 5000) {
        return { rating: 'Slow', description: 'Slow overall execution, consider optimization', severity: 4 };
    } else {
        return { rating: 'Very Slow', description: 'Very slow overall execution, optimization required', severity: 5 };
    }
}