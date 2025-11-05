import * as vscode from "vscode";

export interface LogEntry {
	level: LogLevel;
	message: string;
	timestamp: Date;
	source?: string | undefined;
	metadata?: Record<string, any> | undefined;
}

export enum LogLevel {
	Trace = 0,
	Debug = 1,
	Info = 2,
	Warn = 3,
	Error = 4,
	Critical = 5,
}

export class Logger {
	private static outputChannel: vscode.OutputChannel;
	private static logLevel: LogLevel = LogLevel.Info;
	private static logs: LogEntry[] = [];
	private static maxLogs: number = 10000;

	static initializeOutputChannel(): void {
		if (!this.outputChannel) {
			this.outputChannel = vscode.window.createOutputChannel("PostgreSQL Schema Sync");
		}
	}

	static debug(message: string, source?: string, metadata?: Record<string, any>): void {
		this.log(LogLevel.Debug, message, source, metadata);
	}

	static info(message: string, source?: string, metadata?: Record<string, any>): void {
		this.log(LogLevel.Info, message, source, metadata);
	}

	static warn(message: string, source?: string, metadata?: Record<string, any>): void {
		this.log(LogLevel.Warn, message, source, metadata);
	}

	static error(message: string, source?: string, metadata?: Record<string, any>): void;
	static error(message: string, error: Error, source?: string, metadata?: Record<string, any>): void;
	static error(
		message: string,
		errorOrSource?: string | Error,
		sourceOrMetadata?: string | Record<string, any>,
		metadata?: Record<string, any>,
	): void {
		let error: Error | undefined;
		let source: string | undefined;
		let meta: Record<string, any> | undefined;

		if (errorOrSource instanceof Error) {
			error = errorOrSource;
			source = typeof sourceOrMetadata === "string" ? sourceOrMetadata : undefined;
			meta = metadata;
		} else {
			source = errorOrSource;
			meta = sourceOrMetadata as Record<string, any>;
		}

		this.log(LogLevel.Error, message, source, meta, error);
	}

	static critical(message: string, source?: string, metadata?: Record<string, any>): void;
	static critical(message: string, error: Error, source?: string, metadata?: Record<string, any>): void;
	static critical(
		message: string,
		errorOrSource?: string | Error,
		sourceOrMetadata?: string | Record<string, any>,
		metadata?: Record<string, any>,
	): void {
		let error: Error | undefined;
		let source: string | undefined;
		let meta: Record<string, any> | undefined;

		if (errorOrSource instanceof Error) {
			error = errorOrSource;
			source = typeof sourceOrMetadata === "string" ? sourceOrMetadata : undefined;
			meta = metadata;
		} else {
			source = errorOrSource;
			meta = sourceOrMetadata as Record<string, any>;
		}

		this.log(LogLevel.Critical, message, source, meta, error);
	}

	private static log(
		level: LogLevel,
		message: string,
		source?: string,
		metadata?: Record<string, any>,
		error?: Error,
	): void {
		if (level < this.logLevel) {
			return;
		}

		const entry: LogEntry = {
			level,
			message,
			timestamp: new Date(),
			source,
			metadata,
		};

		// Add to logs array
		this.logs.push(entry);

		// Keep only the most recent logs
		if (this.logs.length > this.maxLogs) {
			this.logs = this.logs.slice(-this.maxLogs);
		}

		// Format message for output
		const levelName = LogLevel[level].toUpperCase();
		const timestamp = entry.timestamp.toISOString();
		const sourceInfo = source ? `[${source}] ` : "";
		const metadataInfo = metadata ? ` | ${JSON.stringify(metadata)}` : "";
		const errorInfo = error ? `\nError: ${error.message}\nStack: ${error.stack}` : "";

		const formattedMessage = `${timestamp} [${levelName}] ${sourceInfo}${message}${metadataInfo}${errorInfo}`;

		// Write to output channel
		if (this.outputChannel) {
			this.outputChannel.appendLine(formattedMessage);
		}

		// Also write to VSCode's developer console for debugging
		if (level >= LogLevel.Error) {
			console.error(formattedMessage);
		} else if (level >= LogLevel.Warn) {
			console.warn(formattedMessage);
		} else {
			console.log(formattedMessage);
		}
	}

	static showOutputChannel(): void {
		if (this.outputChannel) {
			this.outputChannel.show();
		}
	}

	static dispose(): void {
		if (this.outputChannel) {
			this.outputChannel.dispose();
			this.outputChannel = null as any;
		}
		this.logs = [];
	}
}
