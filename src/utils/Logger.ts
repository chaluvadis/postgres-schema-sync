import * as vscode from 'vscode';

export class Logger {
    private static outputChannel: vscode.OutputChannel | undefined;

    private static getOutputChannel(): vscode.OutputChannel {
        if (!this.outputChannel) {
            this.outputChannel = vscode.window.createOutputChannel('PostgreSQL Schema Sync');
        }
        return this.outputChannel;
    }

    static showOutputChannel(): void {
        this.getOutputChannel().show();
    }

    static info(message: string, ...args: any[]): void {
        const timestamp = new Date().toISOString();
        const formattedMessage = `[${timestamp}] INFO: ${message}`;
        console.log(formattedMessage, ...args);
        this.getOutputChannel().appendLine(formattedMessage);
    }

    static warn(message: string, ...args: any[]): void {
        const timestamp = new Date().toISOString();
        const formattedMessage = `[${timestamp}] WARN: ${message}`;
        console.warn(formattedMessage, ...args);
        this.getOutputChannel().appendLine(formattedMessage);
    }

    static error(message: string, error?: Error, ...args: any[]): void {
        const timestamp = new Date().toISOString();
        const formattedMessage = `[${timestamp}] ERROR: ${message}`;
        console.error(formattedMessage, error, ...args);
        this.getOutputChannel().appendLine(formattedMessage);
        if (error) {
            this.getOutputChannel().appendLine(`Error details: ${error.message}`);
            if (error.stack) {
                this.getOutputChannel().appendLine(`Stack trace: ${error.stack}`);
            }
        }
    }

    static debug(message: string, ...args: any[]): void {
        const isDebugEnabled = vscode.workspace.getConfiguration('postgresql-schema-sync').get('debug.enabled', false);
        if (isDebugEnabled) {
            const timestamp = new Date().toISOString();
            const formattedMessage = `[${timestamp}] DEBUG: ${message}`;
            console.debug(formattedMessage, ...args);
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