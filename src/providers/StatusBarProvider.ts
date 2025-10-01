import * as vscode from 'vscode';
import { ConnectionManager } from '../managers/ConnectionManager';
import { Logger } from '../utils/Logger';

export class StatusBarProvider {
    private statusBarItem: vscode.StatusBarItem;
    private connectionManager: ConnectionManager;
    private currentOperation: string | undefined;

    constructor(connectionManager: ConnectionManager) {
        this.connectionManager = connectionManager;
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.statusBarItem.command = 'postgresql.showLogs';

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

        if (totalCount === 0) {
            this.statusBarItem.text = '$(database) PostgreSQL: No connections';
            this.statusBarItem.tooltip = 'No PostgreSQL connections configured';
            this.statusBarItem.color = undefined;
        } else if (connectedCount === totalCount) {
            this.statusBarItem.text = `$(check) PostgreSQL: ${connectedCount}/${totalCount} connected`;
            this.statusBarItem.tooltip = `${connectedCount} of ${totalCount} connections are active`;
            this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.activeBackground');
        } else if (connectedCount > 0) {
            this.statusBarItem.text = `$(warning) PostgreSQL: ${connectedCount}/${totalCount} connected`;
            this.statusBarItem.tooltip = `${connectedCount} of ${totalCount} connections are active`;
            this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            this.statusBarItem.text = `$(error) PostgreSQL: ${totalCount} disconnected`;
            this.statusBarItem.tooltip = 'All PostgreSQL connections are inactive';
            this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.errorBackground');
        }

        if (this.currentOperation) {
            this.statusBarItem.text += ` | $(sync~spin) ${this.currentOperation}`;
        }

        this.statusBarItem.show();
    }

    setCurrentOperation(operation: string): void {
        this.currentOperation = operation;
        this.updateStatusBar();

        // Clear operation after a delay
        setTimeout(() => {
            if (this.currentOperation === operation) {
                this.currentOperation = undefined;
                this.updateStatusBar();
            }
        }, 3000);
    }

    clearCurrentOperation(): void {
        this.currentOperation = undefined;
        this.updateStatusBar();
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