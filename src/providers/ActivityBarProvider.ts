import * as vscode from 'vscode';
import { ConnectionManager } from '../managers/ConnectionManager';
import { Logger } from '../utils/Logger';

export class ActivityBarProvider {
    private connectionManager: ConnectionManager;

    constructor(connectionManager: ConnectionManager) {
        this.connectionManager = connectionManager;
        this.setupActivityBar();
    }

    private setupActivityBar(): void {
        Logger.info('Activity Bar provider initialized');
        this.setupWelcomeView();
    }

    private setupWelcomeView(): void {
        const connections = this.connectionManager.getConnections();

        if (connections.length === 0) {
            // Show welcome message
            vscode.commands.executeCommand('setContext', 'postgresql:noConnections', true);
        } else {
            vscode.commands.executeCommand('setContext', 'postgresql:noConnections', false);
        }
    }

    updateActivityBar(): void {
        const connections = this.connectionManager.getConnections();
        const connectedCount = connections.filter(c => c.status === 'Connected').length;
        if (connectedCount > 0) {
            vscode.commands.executeCommand('setContext', 'postgresql:connectedCount', connectedCount);
        }
        this.setupWelcomeView();
    }

    dispose(): void {
        Logger.info('Activity Bar provider disposed');
    }
}