import * as vscode from 'vscode';
import { ConnectionManager } from '../managers/ConnectionManager';

export class StatusBarProvider {
    private statusBarItem: vscode.StatusBarItem;
    private connectionManager: ConnectionManager;
    private currentOperation: string | undefined;
    private operationQueue: Array<{ name: string; startTime: number; status: 'pending' | 'running' | 'completed' | 'failed' }> = [];
    private operationHistory: Array<{ name: string; startTime: number; endTime: number; status: 'completed' | 'failed' }> = [];
    private maxHistorySize: number = 50;

    constructor(connectionManager: ConnectionManager) {
        this.connectionManager = connectionManager;
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );

        this.updateStatusBar();
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        // Update status bar when connections change
        vscode.workspace.onDidChangeConfiguration(() => {
            this.updateStatusBar();
        });

        // Update status bar periodically
        setInterval(() => {
            this.updateStatusBar();
        }, 5000);

    }

    updateStatusBar(): void {
        const connections = this.connectionManager.getConnections();
        const connectedCount = connections.filter(c => c.status === 'Connected').length;
        const totalCount = connections.length;


        // Build base status
        let statusText = '';
        let statusTooltip = '';
        let statusColor: vscode.ThemeColor | undefined;

        if (totalCount === 0) {
            statusText = '$(database) PostgreSQL: No connections';
            statusTooltip = 'No PostgreSQL connections configured';
            statusColor = undefined;
        } else if (connectedCount === totalCount) {
            statusText = `$(check) PostgreSQL: ${connectedCount}/${totalCount} connected`;
            statusTooltip = `${connectedCount} of ${totalCount} connections are active`;
            statusColor = new vscode.ThemeColor('statusBarItem.activeBackground');
        } else if (connectedCount > 0) {
            statusText = `$(warning) PostgreSQL: ${connectedCount}/${totalCount} connected`;
            statusTooltip = `${connectedCount} of ${totalCount} connections are active`;
            statusColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            statusText = `$(error) PostgreSQL: ${totalCount} disconnected`;
            statusTooltip = 'All PostgreSQL connections are inactive';
            statusColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        }


        // Add current operation with enhanced information
        if (this.currentOperation) {
            statusText += ` | $(sync~spin) ${this.currentOperation}`;
        }

        // Build tooltip
        const tooltipParts = [statusTooltip];

        this.statusBarItem.text = statusText;
        this.statusBarItem.tooltip = tooltipParts.join('\n');
        this.statusBarItem.color = statusColor;

        this.statusBarItem.show();
    }

    setCurrentOperation(operation: string): void {
        this.currentOperation = operation;

        // Add to operation queue
        const queueItem = {
            name: operation,
            startTime: Date.now(),
            status: 'running' as const
        };
        this.operationQueue.push(queueItem);

        this.updateStatusBar();

        // Clear operation after a delay
        setTimeout(() => {
            if (this.currentOperation === operation) {
                this.completeOperation(operation, 'completed');
            }
        }, 3000);
    }

    /**
     * Start a long-running operation with progress tracking
     */
    startOperation(
        operationName: string,
        options?: {
            timeout?: number;
            onComplete?: () => void;
            onError?: (error: Error) => void;
        }
    ): { updateProgress: (progress: number) => void; complete: () => void; fail: (error: Error) => void } {
        this.currentOperation = operationName;

        const queueItem = {
            name: operationName,
            startTime: Date.now(),
            status: 'running' as const
        };
        this.operationQueue.push(queueItem);

        this.updateStatusBar();

        const timeout = options?.timeout || 30000; // 30 second default timeout
        const timeoutHandle = setTimeout(() => {
            this.failOperation(operationName, new Error(`Operation timed out after ${timeout}ms`));
            options?.onError?.(new Error(`Operation timed out after ${timeout}ms`));
        }, timeout);

        return {
            updateProgress: (progress: number) => {
                // Update operation with progress indicator
                this.currentOperation = `${operationName} (${progress}%)`;
                this.updateStatusBar();
            },
            complete: () => {
                clearTimeout(timeoutHandle);
                this.completeOperation(operationName, 'completed');
                options?.onComplete?.();
            },
            fail: (error: Error) => {
                clearTimeout(timeoutHandle);
                this.failOperation(operationName, error);
                options?.onError?.(error);
            }
        };
    }

    /**
     * Complete an operation successfully
     */
    completeOperation(operationName: string, status: 'completed' | 'failed'): void {
        // Update in queue
        const queueItem = this.operationQueue.find(item => item.name === operationName);
        if (queueItem) {
            queueItem.status = status;
        }

        // Add to history
        if (status === 'completed') {
            this.addToHistory(operationName, 'completed');
        }

        // Clear current operation if it's the one being completed
        if (this.currentOperation?.startsWith(operationName)) {
            this.currentOperation = undefined;
        }

        // Remove from queue after a short delay
        setTimeout(() => {
            this.operationQueue = this.operationQueue.filter(item => item.name !== operationName);
        }, 1000);

        this.updateStatusBar();
    }

    /**
     * Fail an operation
     */
    failOperation(operationName: string, error: Error): void {
        this.addToHistory(operationName, 'failed');
        this.completeOperation(operationName, 'failed');

        // Show error notification
        vscode.window.showErrorMessage(`Operation failed: ${operationName} - ${error.message}`);
    }

    private addToHistory(operationName: string, status: 'completed' | 'failed'): void {
        const queueItem = this.operationQueue.find(item => item.name === operationName);
        if (queueItem) {
            const historyItem = {
                name: operationName,
                startTime: queueItem.startTime,
                endTime: Date.now(),
                status
            };
            this.operationHistory.unshift(historyItem);

            // Trim history if it gets too large
            if (this.operationHistory.length > this.maxHistorySize) {
                this.operationHistory = this.operationHistory.slice(0, this.maxHistorySize);
            }
        }
    }

    clearCurrentOperation(): void {
        this.currentOperation = undefined;
        this.updateStatusBar();
    }

    /**
     * Get current operation information for enhanced display
     */
    private getCurrentOperationInfo(): { displayText: string; details: string } {
        if (!this.currentOperation) {
            return { displayText: '', details: '' };
        }

        const queueItem = this.operationQueue.find(item => item.name === this.currentOperation);
        if (!queueItem) {
            return { displayText: this.currentOperation, details: this.currentOperation };
        }

        const duration = Date.now() - queueItem.startTime;
        const durationText = this.formatDuration(duration);

        return {
            displayText: `${this.currentOperation} (${durationText})`,
            details: `${this.currentOperation} running for ${durationText}`
        };
    }

    /**
     * Format duration for display
     */
    private formatDuration(ms: number): string {
        if (ms < 1000) {
            return `${ms}ms`;
        } else if (ms < 60000) {
            return `${(ms / 1000).toFixed(1)}s`;
        } else {
            const minutes = Math.floor(ms / 60000);
            const seconds = Math.floor((ms % 60000) / 1000);
            return `${minutes}m ${seconds}s`;
        }
    }

    /**
     * Show operation history
     */
    showOperationHistory(): void {
        if (this.operationHistory.length === 0) {
            vscode.window.showInformationMessage('No operation history available');
            return;
        }

        const historyText = this.operationHistory
            .slice(0, 10) // Show last 10 operations
            .map((op, index) => {
                const duration = op.endTime - op.startTime;
                const statusIcon = op.status === 'completed' ? '✅' : '❌';
                return `${index + 1}. ${statusIcon} ${op.name} (${this.formatDuration(duration)})`;
            })
            .join('\n');

        const outputChannel = vscode.window.createOutputChannel('PostgreSQL Operation History');
        outputChannel.clear();
        outputChannel.appendLine('Recent Operation History:');
        outputChannel.appendLine(historyText);
        outputChannel.show();
    }

    /**
     * Get operation statistics
     */
    getOperationStatistics(): {
        totalOperations: number;
        completedOperations: number;
        failedOperations: number;
        averageDuration: number;
        successRate: number;
    } {
        const totalOperations = this.operationHistory.length;
        const completedOperations = this.operationHistory.filter(op => op.status === 'completed').length;
        const failedOperations = this.operationHistory.filter(op => op.status === 'failed').length;

        const averageDuration = totalOperations > 0
            ? this.operationHistory.reduce((sum, op) => sum + (op.endTime - op.startTime), 0) / totalOperations
            : 0;

        const successRate = totalOperations > 0 ? (completedOperations / totalOperations) * 100 : 0;

        return {
            totalOperations,
            completedOperations,
            failedOperations,
            averageDuration,
            successRate
        };
    }

    showConnectionStatus(connectionId: string): void {
        const connection = this.connectionManager.getConnection(connectionId);
        if (connection) {
            const status = connection.status === 'Connected' ? 'Connected' : 'Disconnected';
            vscode.window.showInformationMessage(
                `Connection "${connection.name}": ${status}`
            );
        }
    }


    dispose(): void {
        this.statusBarItem.dispose();
    }
}