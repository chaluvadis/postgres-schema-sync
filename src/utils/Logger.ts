import * as vscode from 'vscode';

export class Logger {
    private static outputChannel: vscode.OutputChannel | undefined;

    private static getOutputChannel(): vscode.OutputChannel {
        if (!this.outputChannel) {
            this.outputChannel = vscode.window.createOutputChannel('PostgreSQL Schema Sync');
        }
        return this.outputChannel;
    }

    /**
     * Intelligently formats different data types for logging
     */
    private static formatLogData(data: any): string {
        if (data === null || data === undefined) {
            return String(data);
        }

        if (typeof data === 'string') {
            return data;
        }

        if (typeof data === 'number' || typeof data === 'boolean') {
            return String(data);
        }

        if (data instanceof Error) {
            let errorMessage = `Error: ${data.message}`;
            if (data.stack) {
                errorMessage += `\nStack trace: ${data.stack}`;
            }
            return errorMessage;
        }

        if (Array.isArray(data)) {
            return JSON.stringify(data, null, 2);
        }

        if (typeof data === 'object') {
            return JSON.stringify(data, null, 2);
        }

        return String(data);
    }

    static showOutputChannel(): void {
        this.getOutputChannel().show();
    }

    static info(message: string, ...args: any[]): void {
        const timestamp = new Date().toISOString();
        let formattedMessage = `[${timestamp}] INFO: ${message}`;

        // Handle structured data logging
        if (args.length > 0) {
            const structuredData = args[0];
            if (structuredData && (typeof structuredData === 'object' || structuredData instanceof Error)) {
                const formattedData = this.formatLogData(structuredData);
                formattedMessage += ` | ${formattedData}`;
            } else if (structuredData !== undefined) {
                // Handle primitive values or other types
                formattedMessage += ` | ${String(structuredData)}`;
            }
        }

        this.getOutputChannel().appendLine(formattedMessage);
    }

    static warn(message: string, ...args: any[]): void {
        const timestamp = new Date().toISOString();
        let formattedMessage = `[${timestamp}] WARN: ${message}`;

        // Handle structured data logging
        if (args.length > 0) {
            const structuredData = args[0];
            if (structuredData && (typeof structuredData === 'object' || structuredData instanceof Error)) {
                const formattedData = this.formatLogData(structuredData);
                formattedMessage += ` | ${formattedData}`;
            } else if (structuredData !== undefined) {
                // Handle primitive values or other types
                formattedMessage += ` | ${String(structuredData)}`;
            }
        }

        this.getOutputChannel().appendLine(formattedMessage);
    }

    static error(message: string, errorOrData?: Error | any, ...args: any[]): void {
        const timestamp = new Date().toISOString();
        let formattedMessage = `[${timestamp}] ERROR: ${message}`;

        // Handle Error object (existing behavior)
        if (errorOrData instanceof Error) {
            const formattedError = this.formatLogData(errorOrData);
            formattedMessage += ` | ${formattedError}`;
        }
        // Handle structured data (new functionality)
        else if (errorOrData && (typeof errorOrData === 'object' || Array.isArray(errorOrData))) {
            const formattedData = this.formatLogData(errorOrData);
            formattedMessage += ` | ${formattedData}`;
        }
        // Handle primitive values
        else if (errorOrData !== undefined) {
            formattedMessage += ` | ${String(errorOrData)}`;
        }

        this.getOutputChannel().appendLine(formattedMessage);
    }

    static debug(message: string, ...args: any[]): void {
        const isDebugEnabled = vscode.workspace.getConfiguration('postgresql-schema-sync').get('debug.enabled', false);
        if (isDebugEnabled) {
            const timestamp = new Date().toISOString();
            let formattedMessage = `[${timestamp}] DEBUG: ${message}`;

            // Handle structured data logging
            if (args.length > 0) {
                const structuredData = args[0];
                if (structuredData && (typeof structuredData === 'object' || structuredData instanceof Error)) {
                    const formattedData = this.formatLogData(structuredData);
                    formattedMessage += ` | ${formattedData}`;
                } else if (structuredData !== undefined) {
                    // Handle primitive values or other types
                    formattedMessage += ` | ${String(structuredData)}`;
                }
            }

            this.getOutputChannel().appendLine(formattedMessage);
        }
    }

    static dispose(): void {
        if (this.outputChannel) {
            this.outputChannel.dispose();
            this.outputChannel = undefined;
        }
    }
}