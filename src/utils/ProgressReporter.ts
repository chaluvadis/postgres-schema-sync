import * as vscode from 'vscode';
import { Logger } from './Logger';

export interface ProgressStep {
    message: string;
    increment: number;
}

export interface ProgressOptions {
    title: string;
    location?: vscode.ProgressLocation;
    cancellable?: boolean;
    steps?: ProgressStep[];
}

export class ProgressReporter {
    private static currentProgress?: vscode.Progress<{ message?: string; increment?: number }> | undefined;
    private static currentToken?: vscode.CancellationToken | undefined;
    private static currentOperation?: string | undefined;

    static async withProgress<T>(
        options: ProgressOptions,
        operation: (progress: vscode.Progress<{ message?: string; increment?: number }>, token: vscode.CancellationToken) => Promise<T>
    ): Promise<T> {
        return vscode.window.withProgress(
            {
                location: options.location || vscode.ProgressLocation.Notification,
                title: options.title,
                cancellable: options.cancellable || false
            },
            async (progress, token) => {
                this.currentProgress = progress;
                this.currentToken = token;
                this.currentOperation = options.title;

                try {
                    // Report initial progress
                    progress.report({ increment: 0, message: 'Starting...' });

                    // Execute the operation
                    const result = await operation(progress, token);

                    // Report completion
                    progress.report({ increment: 100, message: 'Completed' });

                    return result;
                } catch (error) {
                    // Report error
                    progress.report({ increment: -1, message: 'Failed' });
                    throw error;
                } finally {
                    this.currentProgress = undefined;
                    this.currentToken = undefined;
                    this.currentOperation = undefined;
                }
            }
        );
    }

    static reportProgress(increment: number, message?: string): void {
        if (this.currentProgress) {
            this.currentProgress.report({
                increment,
                ...(message && { message })
            });
            Logger.debug('Progress reported', { increment, message, operation: this.currentOperation });
        }
    }

    static reportStep(stepIndex: number, steps: ProgressStep[]): void {
        if (stepIndex < steps.length) {
            const step = steps[stepIndex];
            this.reportProgress(step.increment, step.message);
        }
    }

    static isCancellationRequested(): boolean {
        return this.currentToken?.isCancellationRequested || false;
    }

    static getCurrentOperation(): string | undefined {
        return this.currentOperation;
    }

    static async executeWithSteps<T>(
        options: ProgressOptions,
        steps: ProgressStep[],
        stepOperation: (stepIndex: number, progress: vscode.Progress<{ message?: string; increment?: number }>, token: vscode.CancellationToken) => Promise<T>
    ): Promise<T> {
        return this.withProgress(options, async (progress, token) => {
            let currentStep = 0;

            for (let i = 0; i < steps.length; i++) {
                if (token.isCancellationRequested) {
                    throw new Error('Operation cancelled by user');
                }

                this.reportStep(i, steps);
                currentStep = i;

                try {
                    await stepOperation(i, progress, token);
                } catch (error) {
                    Logger.error('Step operation failed', error as Error, { stepIndex: i, step: steps[i] });
                    throw error;
                }
            }

            return currentStep as T;
        });
    }

    static createProgressSteps(messages: string[], incrementPerStep?: number): ProgressStep[] {
        const increment = incrementPerStep || (100 / messages.length);
        return messages.map(message => ({
            message,
            increment
        }));
    }

    static async simulateProgress<T>(
        options: ProgressOptions,
        totalDuration: number,
        operation: () => Promise<T>
    ): Promise<T> {
        const steps = Math.min(totalDuration / 100, 50); // Update every 100ms, max 50 steps
        const increment = 100 / steps;

        return this.withProgress(options, async (progress) => {
            const startTime = Date.now();

            const result = await operation();

            // Simulate progress updates
            const interval = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const progressPercent = Math.min((elapsed / totalDuration) * 100, 100);

                progress.report({
                    increment: progressPercent,
                    message: `Processing... ${progressPercent.toFixed(1)}%`
                });

                if (progressPercent >= 100) {
                    clearInterval(interval);
                }
            }, totalDuration / steps);

            return result;
        });
    }
}