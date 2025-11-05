import * as vscode from 'vscode';
import { ExtensionComponents } from '@/utils/ExtensionInitializer';
import { Logger } from '@/utils/Logger';

/**
 * Handles additional utility commands for the PostgreSQL extension.
 * Manages help, settings, and connection management commands.
 */
export class AdditionalCommandHandlers {
    private components: ExtensionComponents;

    constructor(components: ExtensionComponents) {
        this.components = components;
    }

    /**
     * Shows help documentation.
     */
    async showHelp(): Promise<void> {
        try {
            const helpUrl = 'https://github.com/chaluvadis/postgresql-schema-sync#readme';
            const success = await vscode.env.openExternal(vscode.Uri.parse(helpUrl));
            if (success) {
                Logger.info('Help documentation opened successfully', 'AdditionalCommandHandlers');
            } else {
                Logger.warn('Help documentation may not have opened', 'AdditionalCommandHandlers');
                vscode.window.showWarningMessage('Help documentation may not have opened. Please check your default browser.');
            }
        } catch (error) {
            Logger.error('Failed to open help', error as Error, 'AdditionalCommandHandlers');
            vscode.window.showErrorMessage('Failed to open help documentation');
        }
    }

    /**
     * Opens extension settings.
     */
    async openSettings(): Promise<void> {
        try {
            await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:nomad-in-code.postgresql-schema-sync');
            Logger.info('Extension settings opened successfully', 'AdditionalCommandHandlers');
        } catch (error) {
            Logger.error('Failed to open settings', error as Error, 'AdditionalCommandHandlers');
            vscode.window.showErrorMessage('Failed to open extension settings');
        }
    }

    /**
     * Manages database connections.
     */
    async manageConnections(): Promise<void> {
        try {
            if (this.components.connectionManager) {
                // Use connection management view for managing connections
                const { ConnectionManagementView } = await import('../views/legacy/ConnectionManagementView');
                const connectionView = new ConnectionManagementView(this.components.connectionManager);
                await connectionView.showConnectionDialog();
                Logger.info('Connection management opened successfully', 'AdditionalCommandHandlers');
            } else {
                Logger.warn('Connection manager not available', 'AdditionalCommandHandlers');
                vscode.window.showErrorMessage('Connection manager not available');
            }
        } catch (error) {
            Logger.error('Failed to open connection management', error as Error, 'AdditionalCommandHandlers');
            vscode.window.showErrorMessage(`Failed to open connection management: ${(error as Error).message}`);
        }
    }
}