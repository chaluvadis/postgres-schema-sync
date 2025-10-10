import * as vscode from 'vscode';
import { ConnectionManager, DatabaseConnection } from '@/managers/ConnectionManager';
import { Logger } from '@/utils/Logger';

export class ConnectionManagementView {
    private connectionManager: ConnectionManager;
    constructor(connectionManager: ConnectionManager) {
        this.connectionManager = connectionManager;
    }

    async showConnectionDialog(existingConnection?: DatabaseConnection): Promise<DatabaseConnection | undefined> {
        const panel = vscode.window.createWebviewPanel(
            'connectionManagement',
            existingConnection ? `Edit Connection: ${existingConnection.name}` : 'Add PostgreSQL Connection',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        const connections = this.connectionManager.getConnections();
        const connectionHtml = await this.generateConnectionHtml(connections, existingConnection);
        panel.webview.html = connectionHtml;

        return new Promise<DatabaseConnection | undefined>((resolve) => {
            panel.webview.onDidReceiveMessage(async (message) => {
                switch (message.command) {
                    case 'saveConnection':
                        try {
                            const connection = message.connection as DatabaseConnection;
                            if (existingConnection) {
                                await this.connectionManager.updateConnection(existingConnection.id, connection);
                                vscode.window.showInformationMessage(`Connection "${connection.name}" updated successfully`);
                            } else {
                                await this.connectionManager.addConnection(connection);
                                vscode.window.showInformationMessage(`Connection "${connection.name}" added successfully`);
                            }
                            panel.dispose();
                            resolve(connection);
                        } catch (error) {
                            Logger.error('Failed to save connection', error as Error);
                            vscode.window.showErrorMessage(`Failed to save connection: ${(error as Error).message}`);
                        }
                        break;

                    case 'testConnection':
                        try {
                            const connection = message.connection as DatabaseConnection;

                            // Test connection - use connection data directly for new connections
                            let success = false;
                            if (connection.id && connection.id.trim() !== '') {
                                // Existing connection - use ID-based test
                                success = await this.connectionManager.testConnection(connection.id);
                            } else {
                                // New connection - use data-based test
                                success = await this.connectionManager.testConnectionData({
                                    name: connection.name,
                                    host: connection.host,
                                    port: connection.port,
                                    database: connection.database,
                                    username: connection.username,
                                    password: connection.password
                                });
                            }

                            panel.webview.postMessage({
                                command: 'connectionTestResult',
                                success,
                                connectionId: connection.id || 'new'
                            });
                        } catch (error) {
                            Logger.error('Failed to test connection', error as Error);
                            panel.webview.postMessage({
                                command: 'connectionTestResult',
                                success: false,
                                connectionId: message.connection.id || 'new',
                                error: (error as Error).message
                            });
                        }
                        break;

                    case 'cancel':
                        panel.dispose();
                        resolve(undefined);
                        break;
                }
            });
        });
    }

    private async generateConnectionHtml(connections: DatabaseConnection[], existingConnection?: DatabaseConnection): Promise<string> {
        const isEdit = !!existingConnection;

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>PostgreSQL Connection Management</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 20px;
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                    }
                    .form-group {
                        margin-bottom: 20px;
                    }
                    .form-group label {
                        display: block;
                        margin-bottom: 5px;
                        font-weight: bold;
                        color: var(--vscode-textLink-foreground);
                    }
                    .form-group input, .form-group select {
                        width: 100%;
                        padding: 8px;
                        border: 1px solid var(--vscode-input-border);
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border-radius: 4px;
                        box-sizing: border-box;
                    }
                    .form-group input:focus {
                        outline: none;
                        border-color: var(--vscode-focusBorder);
                    }
                    .form-row {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 15px;
                    }
                    .actions {
                        margin-top: 30px;
                        display: flex;
                        gap: 10px;
                        justify-content: flex-end;
                    }
                    .btn {
                        padding: 10px 20px;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 13px;
                        font-weight: bold;
                    }
                    .btn-primary {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                    }
                    .btn-primary:hover {
                        background: var(--vscode-button-hoverBackground);
                    }
                    .btn-secondary {
                        background: var(--vscode-button-secondaryBackground);
                        color: var(--vscode-button-secondaryForeground);
                    }
                    .btn-secondary:hover {
                        background: var(--vscode-button-secondaryHoverBackground);
                    }
                    .btn-danger {
                        background: var(--vscode-statusBarItem-errorBackground);
                        color: var(--vscode-statusBarItem-errorForeground);
                    }
                    .connection-list {
                        margin-top: 20px;
                    }
                    .connection-item {
                        background: var(--vscode-list-inactiveSelectionBackground);
                        padding: 10px;
                        margin-bottom: 10px;
                        border-radius: 4px;
                        border: 1px solid var(--vscode-list-inactiveSelectionBackground);
                    }
                    .connection-name {
                        font-weight: bold;
                        color: var(--vscode-textLink-foreground);
                    }
                    .connection-details {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                        margin-top: 5px;
                    }
                    .test-result {
                        margin-top: 10px;
                        padding: 8px;
                        border-radius: 4px;
                        font-size: 12px;
                    }
                    .test-success {
                        background: var(--vscode-notificationsInfoBackground);
                        color: var(--vscode-notificationsInfoForeground);
                    }
                    .test-error {
                        background: var(--vscode-notificationsErrorBackground);
                        color: var(--vscode-notificationsErrorForeground);
                    }
                </style>
            </head>
            <body>
                <h2>${isEdit ? 'Edit' : 'Add'} PostgreSQL Connection</h2>

                <form id="connectionForm">
                    <div class="form-group">
                        <label for="connectionName">Connection Name *</label>
                        <input type="text" id="connectionName" name="connectionName"
                               value="${existingConnection?.name || ''}" required>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="host">Host *</label>
                            <input type="text" id="host" name="host"
                                   value="${existingConnection?.host || 'localhost'}" required>
                        </div>
                        <div class="form-group">
                            <label for="port">Port *</label>
                            <input type="number" id="port" name="port"
                                   value="${existingConnection?.port || '5432'}" min="1" max="65535" required>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="database">Database *</label>
                        <input type="text" id="database" name="database"
                               value="${existingConnection?.database || ''}" required>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="username">Username *</label>
                            <input type="text" id="username" name="username"
                                   value="${existingConnection?.username || ''}" required>
                        </div>
                        <div class="form-group">
                            <label for="password">Password *</label>
                            <input type="password" id="password" name="password"
                                   value="${existingConnection?.password || ''}" required>
                        </div>
                    </div>

                    <div class="actions">
                        <button type="button" class="btn btn-secondary" onclick="testConnection()">Test Connection</button>
                        <button type="button" class="btn btn-primary" onclick="saveConnection()">Save Connection</button>
                        <button type="button" class="btn btn-secondary" onclick="cancel()">Cancel</button>
                    </div>

                    <div id="testResult" class="test-result" style="display: none;"></div>

                </form>

                ${connections.length > 0 ? `
                <div class="connection-list">
                    <h3>Existing Connections</h3>
                    ${connections.map(conn => `
                        <div class="connection-item">
                            <div class="connection-name">${conn.name}</div>
                            <div class="connection-details">
                                ${conn.host}:${conn.port} / ${conn.database} (${conn.username})
                            </div>
                        </div>
                    `).join('')}
                </div>
                ` : ''}

                <script>
                    const vscode = acquireVsCodeApi();

                    function testConnection() {
                        const connection = getFormData();
                        vscode.postMessage({
                            command: 'testConnection',
                            connection: connection
                        });
                    }

                    function saveConnection() {
                        const connection = getFormData();
                        if (validateForm()) {
                            vscode.postMessage({
                                command: 'saveConnection',
                                connection: connection
                            });
                        }
                    }

                    function cancel() {
                        vscode.postMessage({ command: 'cancel' });
                    }

                    function getFormData() {
                        return {
                            id: '${existingConnection?.id || ''}',
                            name: document.getElementById('connectionName').value,
                            host: document.getElementById('host').value,
                            port: parseInt(document.getElementById('port').value),
                            database: document.getElementById('database').value,
                            username: document.getElementById('username').value,
                            password: document.getElementById('password').value
                        };
                    }

                    function validateForm() {
                        const name = document.getElementById('connectionName').value.trim();
                        const host = document.getElementById('host').value.trim();
                        const port = document.getElementById('port').value;
                        const database = document.getElementById('database').value.trim();
                        const username = document.getElementById('username').value.trim();
                        const password = document.getElementById('password').value;

                        if (!name || !host || !port || !database || !username || !password) {
                            alert('Please fill in all required fields');
                            return false;
                        }

                        if (port < 1 || port > 65535) {
                            alert('Port must be between 1 and 65535');
                            return false;
                        }

                        return true;
                    }

                    // Handle messages from extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.command) {
                            case 'connectionTestResult':
                                showTestResult(message);
                                break;
                        }
                    });

                    function showTestResult(message) {
                        const resultDiv = document.getElementById('testResult');
                        if (message.success) {
                            resultDiv.textContent = 'Connection test successful!';
                            resultDiv.className = 'test-result test-success';
                        } else {
                            resultDiv.textContent = 'Connection test failed: ' + (message.error || 'Unknown error');
                            resultDiv.className = 'test-result test-error';
                        }
                        resultDiv.style.display = 'block';

                    }

                </script>
            </body>
            </html>
        `;
    }
}