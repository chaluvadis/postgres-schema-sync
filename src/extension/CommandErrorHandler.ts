import * as vscode from "vscode";
import { Logger } from "@/utils/Logger";

interface CommandError {
	command: string;
	error: string;
	timestamp: Date;
	context?: any;
}

/**
 * Handles command execution errors and provides monitoring capabilities.
 * Manages error history, statistics, and health monitoring for commands.
 */
export class CommandErrorHandler {
	private commandErrors: CommandError[] = [];
	private totalExecutions: number = 0;
	private monitoringInterval?: NodeJS.Timeout;

	/**
	 * Handles a command execution error.
	 * @param command The command that failed.
	 * @param error The error that occurred.
	 * @param context Additional context for the error.
	 */
	handleCommandError(command: string, error: Error, context?: any[]): void {
		const commandError: CommandError = {
			command,
			error: error.message,
			timestamp: new Date(),
			context,
		};

		// Limit error history to prevent memory bloat (keep last 100 errors)
		if (this.commandErrors.length >= 100) {
			this.commandErrors.shift(); // Remove oldest error
		}
		this.commandErrors.push(commandError);

		Logger.error("Command execution failed", error, "CommandErrorHandler", {
			command,
			context,
		});

		// Show user-friendly error message
		vscode.window.showErrorMessage(`Command "${command}" failed: ${error.message}`);
	}

	/**
	 * Increments the total execution count.
	 */
	incrementExecutionCount(): void {
		this.totalExecutions++;
	}

	/**
	 * Gets command execution statistics.
	 * @returns Statistics about command execution.
	 */
	getCommandStats(): {
		totalErrors: number;
		recentErrors: CommandError[];
		errorRate: number;
		successRate: number;
		totalExecutions: number;
	} {
		const totalErrors = this.commandErrors.length;
		const errorRate = this.totalExecutions > 0 ? (totalErrors / this.totalExecutions) * 100 : 0;
		const successRate = 100 - errorRate;

		return {
			totalErrors: this.commandErrors.length,
			recentErrors: this.commandErrors.slice(-10), // Last 10 errors
			errorRate: Math.round(errorRate * 100) / 100,
			successRate: Math.round(successRate * 100) / 100,
			totalExecutions: this.totalExecutions,
		};
	}

	/**
	 * Shows command execution statistics in an output channel.
	 */
	showCommandStats(): void {
		const stats = this.getCommandStats();
		const recentErrorsText =
			stats.recentErrors.length > 0
				? `\n\nRecent Errors:\n${stats.recentErrors
						.map(
							(error, index) =>
								`${index + 1}. ${error.command}: ${error.error} (${error.timestamp.toLocaleTimeString()})`,
						)
						.join("\n")}`
				: "\n\nNo recent errors";

		const statsMessage = `
                PostgreSQL Extension - Command Statistics
                =========================================

                Total Executions: ${stats.totalExecutions}
                Total Errors: ${stats.totalErrors}
                Success Rate: ${stats.successRate}%
                Error Rate: ${stats.errorRate}%
                ${recentErrorsText}

                Generated at: ${new Date().toLocaleString()}
        `.trim();

		Logger.info("Command Statistics Report displayed", "CommandErrorHandler", {
			totalExecutions: stats.totalExecutions,
			totalErrors: stats.totalErrors,
			successRate: stats.successRate,
			errorRate: stats.errorRate,
		});

		// Show in output channel
		const channel = vscode.window.createOutputChannel("PostgreSQL Commands");
		channel.clear();
		channel.appendLine(statsMessage);
		channel.show();

		// Also show summary in info message
		vscode.window
			.showInformationMessage(
				`PostgreSQL Commands: ${stats.totalExecutions} executions, ${stats.successRate}% success rate`,
				"View Details",
			)
			.then((selection) => {
				if (selection === "View Details") {
					channel.show();
				}
			});
	}

	/**
	 * Clears the command error history.
	 */
	clearCommandErrors(): void {
		const clearedCount = this.commandErrors.length;
		this.commandErrors = [];

		Logger.info("Command error history cleared", "CommandErrorHandler", {
			clearedCount,
		});

		vscode.window.showInformationMessage(`Cleared ${clearedCount} command errors from history`);
	}

	/**
	 * Starts command health monitoring.
	 */
	startCommandMonitoring(): void {
		// Get monitoring interval from configuration (default: 5 minutes)
		const config = vscode.workspace.getConfiguration("postgresql");
		const intervalMinutes = config.get<number>("commandMonitoringInterval", 5);
		const intervalMs = intervalMinutes * 60 * 1000;

		// Monitor command health
		this.monitoringInterval = setInterval(() => {
			this.monitorCommandHealth();
		}, intervalMs);

		Logger.info("Command health monitoring started", "CommandErrorHandler", {
			intervalMinutes,
		});
	}

	/**
	 * Stops command health monitoring.
	 */
	stopCommandMonitoring(): void {
		if (this.monitoringInterval) {
			clearInterval(this.monitoringInterval);
			this.monitoringInterval = undefined;
			Logger.info("Command health monitoring stopped", "CommandErrorHandler");
		}
	}

	/**
	 * Monitors command health and logs warnings for high error rates.
	 */
	private monitorCommandHealth(): void {
		const stats = this.getCommandStats();

		// Check for high error rates
		if (stats.errorRate > 50 && stats.totalErrors > 5) {
			Logger.warn("High command error rate detected", "CommandErrorHandler", {
				errorRate: stats.errorRate,
				totalErrors: stats.totalErrors,
				totalExecutions: stats.totalExecutions,
			});

			// Show warning to user
			vscode.window
				.showWarningMessage(
					`High command error rate detected (${stats.errorRate}%). Consider checking the logs.`,
					"View Logs",
					"Clear Errors",
				)
				.then((selection) => {
					if (selection === "View Logs") {
						this.showCommandStats();
					} else if (selection === "Clear Errors") {
						this.clearCommandErrors();
					}
				});
		}

		// Check for commands that have never been executed successfully
		const failedCommands = this.getFailedCommands();
		if (failedCommands.length > 0) {
			Logger.warn("Commands with execution issues detected", "CommandErrorHandler", {
				failedCommands: failedCommands.length,
				commands: failedCommands,
			});
		}
	}

	/**
	 * Gets commands that have failed multiple times.
	 * @returns Array of command names with multiple failures.
	 */
	private getFailedCommands(): string[] {
		const commandErrorMap = new Map<string, number>();

		// Count errors per command
		this.commandErrors.forEach((error) => {
			const count = commandErrorMap.get(error.command) || 0;
			commandErrorMap.set(error.command, count + 1);
		});

		// Return commands with multiple errors
		return Array.from(commandErrorMap.entries())
			.filter(([_, count]) => count > 2)
			.map(([command, _]) => command);
	}

	/**
	 * Disposes the error handler and cleans up resources.
	 */
	dispose(): void {
		Logger.info("Disposing CommandErrorHandler", "CommandErrorHandler");
		this.stopCommandMonitoring();
		this.commandErrors = [];
		Logger.info("CommandErrorHandler disposed successfully", "CommandErrorHandler");
	}
}
