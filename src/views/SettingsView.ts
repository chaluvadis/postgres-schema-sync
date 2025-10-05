import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';

export interface ExtensionSettings {
    compare: {
        mode: 'strict' | 'lenient';
        ignoreSchemas: string[];
        includeSystemObjects: boolean;
        caseSensitive: boolean;
    };
    migration: {
        dryRun: boolean;
        batchSize: number;
        stopOnError: boolean;
        transactionMode: 'all_or_nothing' | 'continue_on_error';
    };
    notifications: {
        enabled: boolean;
        showProgress: boolean;
        soundEnabled: boolean;
    };
    theme: {
        colorScheme: 'auto' | 'light' | 'dark';
        compactMode: boolean;
    };
    debug: {
        enabled: boolean;
        logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error';
    };
    security: {
        certificateValidation: boolean;
        allowSelfSigned: boolean;
        securityLevel: 'strict' | 'warning' | 'permissive';
    };
}

export class SettingsView {
    private panel: vscode.WebviewPanel | undefined;
    private settings: ExtensionSettings;

    constructor() {
        this.settings = this.loadSettings();
    }

    async showSettings(): Promise<void> {
        try {
            Logger.info('Opening extension settings view');

            this.panel = vscode.window.createWebviewPanel(
                'postgresqlSettings',
                'PostgreSQL Extension Settings',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [
                        vscode.Uri.joinPath(vscode.workspace.workspaceFolders?.[0]?.uri || vscode.Uri.parse(''), 'resources')
                    ]
                }
            );

            // Handle panel disposal
            this.panel.onDidDispose(() => {
                this.panel = undefined;
            });

            // Generate and set HTML content
            const htmlContent = await this.generateSettingsHtml(this.settings);
            this.panel.webview.html = htmlContent;

            // Handle messages from webview
            this.panel.webview.onDidReceiveMessage(async (message) => {
                await this.handleWebviewMessage(message);
            });

        } catch (error) {
            Logger.error('Failed to show settings view', error as Error, 'showSettings');
            vscode.window.showErrorMessage(
                `Failed to open settings: ${(error as Error).message}`
            );
        }
    }

    private loadSettings(): ExtensionSettings {
        const config = vscode.workspace.getConfiguration('postgresql-schema-sync');

        return {
            compare: {
                mode: config.get('compare.mode', 'strict'),
                ignoreSchemas: config.get('compare.ignoreSchemas', ['information_schema', 'pg_catalog', 'pg_toast']),
                includeSystemObjects: config.get('compare.includeSystemObjects', false),
                caseSensitive: config.get('compare.caseSensitive', true)
            },
            migration: {
                dryRun: config.get('migration.dryRun', true),
                batchSize: config.get('migration.batchSize', 50),
                stopOnError: config.get('migration.stopOnError', true),
                transactionMode: config.get('migration.transactionMode', 'all_or_nothing')
            },
            notifications: {
                enabled: config.get('notifications.enabled', true),
                showProgress: config.get('notifications.showProgress', true),
                soundEnabled: config.get('notifications.soundEnabled', false)
            },
            theme: {
                colorScheme: config.get('theme.colorScheme', 'auto'),
                compactMode: config.get('theme.compactMode', false)
            },
            debug: {
                enabled: config.get('debug.enabled', false),
                logLevel: config.get('debug.logLevel', 'info')
            },
            security: {
                certificateValidation: config.get('security.certificateValidation', true),
                allowSelfSigned: config.get('security.allowSelfSigned', false),
                securityLevel: config.get('security.securityLevel', 'warning')
            }
        };
    }

    private async saveSettings(newSettings: ExtensionSettings): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('postgresql-schema-sync');

            // Update configuration values
            await config.update('compare.mode', newSettings.compare.mode);
            await config.update('compare.ignoreSchemas', newSettings.compare.ignoreSchemas);
            await config.update('compare.includeSystemObjects', newSettings.compare.includeSystemObjects);
            await config.update('compare.caseSensitive', newSettings.compare.caseSensitive);

            await config.update('migration.dryRun', newSettings.migration.dryRun);
            await config.update('migration.batchSize', newSettings.migration.batchSize);
            await config.update('migration.stopOnError', newSettings.migration.stopOnError);
            await config.update('migration.transactionMode', newSettings.migration.transactionMode);

            await config.update('notifications.enabled', newSettings.notifications.enabled);
            await config.update('notifications.showProgress', newSettings.notifications.showProgress);
            await config.update('notifications.soundEnabled', newSettings.notifications.soundEnabled);

            await config.update('theme.colorScheme', newSettings.theme.colorScheme);
            await config.update('theme.compactMode', newSettings.theme.compactMode);

            await config.update('debug.enabled', newSettings.debug.enabled);
            await config.update('debug.logLevel', newSettings.debug.logLevel);

            await config.update('security.certificateValidation', newSettings.security.certificateValidation);
            await config.update('security.allowSelfSigned', newSettings.security.allowSelfSigned);
            await config.update('security.securityLevel', newSettings.security.securityLevel);

            this.settings = newSettings;

            Logger.info('Settings saved successfully', 'saveSettings');

            vscode.window.showInformationMessage('Settings saved successfully');

        } catch (error) {
            Logger.error('Failed to save settings', error as Error, 'saveSettings');
            vscode.window.showErrorMessage('Failed to save settings');
        }
    }

    private async generateSettingsHtml(settings: ExtensionSettings): Promise<string> {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>PostgreSQL Extension Settings</title>
                <style>
                    :root {
                        --vscode-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        --vscode-editor-background: #1e1e1e;
                        --vscode-editor-foreground: #cccccc;
                        --vscode-panel-border: #3c3c3c;
                        --vscode-textLink-foreground: #4da6ff;
                        --vscode-button-background: #0e639c;
                        --vscode-button-foreground: #ffffff;
                        --vscode-button-hoverBackground: #1177bb;
                        --vscode-input-background: #3c3c3c;
                        --vscode-input-foreground: #cccccc;
                        --vscode-input-border: #3c3c3c;
                        --vscode-list-hoverBackground: #2a2d2e;
                        --vscode-badge-background: #4d4d4d;
                        --vscode-badge-foreground: #ffffff;
                    }

                    body {
                        font-family: var(--vscode-font-family);
                        padding: 0;
                        margin: 0;
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                        height: 100vh;
                        display: flex;
                        flex-direction: column;
                    }

                    .header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 15px 20px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        background: var(--vscode-editor-background);
                    }

                    .content-area {
                        flex: 1;
                        overflow: auto;
                        padding: 20px;
                    }

                    .settings-container {
                        max-width: 800px;
                        margin: 0 auto;
                    }

                    .settings-section {
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 6px;
                        margin-bottom: 20px;
                        overflow: hidden;
                    }

                    .section-header {
                        background: var(--vscode-titleBar-activeBackground, #2f2f2f);
                        padding: 12px 15px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }

                    .section-title {
                        font-weight: bold;
                        font-size: 13px;
                        margin: 0;
                    }

                    .section-content {
                        padding: 15px;
                    }

                    .setting-item {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 10px 0;
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }

                    .setting-item:last-child {
                        border-bottom: none;
                    }

                    .setting-label {
                        flex: 1;
                        font-size: 12px;
                    }

                    .setting-description {
                        font-size: 11px;
                        color: var(--vscode-descriptionForeground);
                        margin-top: 2px;
                    }

                    .setting-control {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                    }

                    .setting-input {
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 3px;
                        padding: 4px 8px;
                        font-size: 12px;
                    }

                    .setting-input:focus {
                        outline: none;
                        border-color: var(--vscode-textLink-foreground);
                    }

                    .setting-select {
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 3px;
                        padding: 4px 8px;
                        font-size: 12px;
                    }

                    .setting-checkbox {
                        margin: 0;
                    }

                    .setting-array {
                        display: flex;
                        flex-direction: column;
                        gap: 5px;
                    }

                    .array-item {
                        display: flex;
                        gap: 5px;
                        align-items: center;
                    }

                    .array-input {
                        flex: 1;
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 3px;
                        padding: 4px 8px;
                        font-size: 12px;
                    }

                    .remove-btn {
                        background: var(--vscode-gitDecoration-deletedResourceForeground);
                        color: var(--vscode-editor-background);
                        border: none;
                        border-radius: 3px;
                        padding: 4px 8px;
                        cursor: pointer;
                        font-size: 10px;
                    }

                    .add-btn {
                        background: var(--vscode-gitDecoration-addedResourceForeground);
                        color: var(--vscode-editor-background);
                        border: none;
                        border-radius: 3px;
                        padding: 4px 8px;
                        cursor: pointer;
                        font-size: 10px;
                        margin-top: 5px;
                    }

                    .footer {
                        padding: 15px 20px;
                        border-top: 1px solid var(--vscode-panel-border);
                        background: var(--vscode-editor-background);
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }

                    .btn {
                        padding: 8px 16px;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 12px;
                        font-weight: bold;
                        transition: background-color 0.2s;
                    }

                    .btn-primary {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                    }

                    .btn-primary:hover {
                        background: var(--vscode-button-hoverBackground);
                    }

                    .btn-secondary {
                        background: var(--vscode-button-secondaryBackground, #3c3c3c);
                        color: var(--vscode-button-secondaryForeground, #cccccc);
                    }

                    .btn-secondary:hover {
                        background: var(--vscode-list-hoverBackground);
                    }

                    .btn-danger {
                        background: var(--vscode-gitDecoration-deletedResourceForeground);
                        color: var(--vscode-editor-background);
                    }

                    .btn-danger:hover {
                        opacity: 0.9;
                    }

                    .status-message {
                        padding: 8px 12px;
                        border-radius: 4px;
                        font-size: 11px;
                        margin-bottom: 10px;
                    }

                    .status-success {
                        background: var(--vscode-gitDecoration-addedResourceForeground);
                        color: var(--vscode-editor-background);
                    }

                    .status-error {
                        background: var(--vscode-gitDecoration-deletedResourceForeground);
                        color: var(--vscode-editor-background);
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h2>PostgreSQL Extension Settings</h2>
                    <div class="header-actions">
                        <button class="btn btn-secondary" onclick="resetToDefaults()">Reset to Defaults</button>
                        <button class="btn btn-primary" onclick="saveSettings()">Save Settings</button>
                    </div>
                </div>

                <div class="content-area">
                    <div class="settings-container">
                        <!-- Schema Comparison Settings -->
                        <div class="settings-section">
                            <div class="section-header">
                                <h3 class="section-title">Schema Comparison</h3>
                            </div>
                            <div class="section-content">
                                <div class="setting-item">
                                    <div class="setting-label">
                                        <div>Comparison Mode</div>
                                        <div class="setting-description">How strict the schema comparison should be</div>
                                    </div>
                                    <div class="setting-control">
                                        <select class="setting-select" id="compareMode">
                                            <option value="strict" ${settings.compare.mode === 'strict' ? 'selected' : ''}>Strict</option>
                                            <option value="lenient" ${settings.compare.mode === 'lenient' ? 'selected' : ''}>Lenient</option>
                                        </select>
                                    </div>
                                </div>

                                <div class="setting-item">
                                    <div class="setting-label">
                                        <div>Case Sensitive</div>
                                        <div class="setting-description">Whether comparison is case sensitive</div>
                                    </div>
                                    <div class="setting-control">
                                        <input type="checkbox" class="setting-checkbox" id="caseSensitive"
                                               ${settings.compare.caseSensitive ? 'checked' : ''}>
                                    </div>
                                </div>

                                <div class="setting-item">
                                    <div class="setting-label">
                                        <div>Include System Objects</div>
                                        <div class="setting-description">Include system schemas in comparison</div>
                                    </div>
                                    <div class="setting-control">
                                        <input type="checkbox" class="setting-checkbox" id="includeSystemObjects"
                                               ${settings.compare.includeSystemObjects ? 'checked' : ''}>
                                    </div>
                                </div>

                                <div class="setting-item">
                                    <div class="setting-label">
                                        <div>Ignore Schemas</div>
                                        <div class="setting-description">Schemas to exclude from comparison</div>
                                    </div>
                                    <div class="setting-control">
                                        <div class="setting-array" id="ignoreSchemas">
                                            ${settings.compare.ignoreSchemas.map(schema => `
                                                <div class="array-item">
                                                    <input type="text" class="array-input" value="${schema}">
                                                    <button class="remove-btn" onclick="removeArrayItem(this)">×</button>
                                                </div>
                                            `).join('')}
                                        </div>
                                        <button class="add-btn" onclick="addArrayItem('ignoreSchemas')">Add Schema</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Migration Settings -->
                        <div class="settings-section">
                            <div class="section-header">
                                <h3 class="section-title">Migration</h3>
                            </div>
                            <div class="section-content">
                                <div class="setting-item">
                                    <div class="setting-label">
                                        <div>Dry Run Mode</div>
                                        <div class="setting-description">Preview migrations without executing them</div>
                                    </div>
                                    <div class="setting-control">
                                        <input type="checkbox" class="setting-checkbox" id="dryRun"
                                               ${settings.migration.dryRun ? 'checked' : ''}>
                                    </div>
                                </div>

                                <div class="setting-item">
                                    <div class="setting-label">
                                        <div>Batch Size</div>
                                        <div class="setting-description">Number of operations per migration batch</div>
                                    </div>
                                    <div class="setting-control">
                                        <input type="number" class="setting-input" id="batchSize"
                                               value="${settings.migration.batchSize}" min="10" max="200">
                                    </div>
                                </div>

                                <div class="setting-item">
                                    <div class="setting-label">
                                        <div>Stop on Error</div>
                                        <div class="setting-description">Stop migration if any error occurs</div>
                                    </div>
                                    <div class="setting-control">
                                        <input type="checkbox" class="setting-checkbox" id="stopOnError"
                                               ${settings.migration.stopOnError ? 'checked' : ''}>
                                    </div>
                                </div>

                                <div class="setting-item">
                                    <div class="setting-label">
                                        <div>Transaction Mode</div>
                                        <div class="setting-description">How to handle transaction rollbacks</div>
                                    </div>
                                    <div class="setting-control">
                                        <select class="setting-select" id="transactionMode">
                                            <option value="all_or_nothing" ${settings.migration.transactionMode === 'all_or_nothing' ? 'selected' : ''}>All or Nothing</option>
                                            <option value="continue_on_error" ${settings.migration.transactionMode === 'continue_on_error' ? 'selected' : ''}>Continue on Error</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Security Settings -->
                        <div class="settings-section">
                            <div class="section-header">
                                <h3 class="section-title">Security</h3>
                            </div>
                            <div class="section-content">
                                <div class="setting-item">
                                    <div class="setting-label">
                                        <div>Certificate Validation</div>
                                        <div class="setting-description">Validate SSL/TLS certificates</div>
                                    </div>
                                    <div class="setting-control">
                                        <input type="checkbox" class="setting-checkbox" id="certificateValidation"
                                               ${settings.security.certificateValidation ? 'checked' : ''}>
                                    </div>
                                </div>

                                <div class="setting-item">
                                    <div class="setting-label">
                                        <div>Allow Self-Signed Certificates</div>
                                        <div class="setting-description">Allow self-signed SSL certificates (not recommended for production)</div>
                                    </div>
                                    <div class="setting-control">
                                        <input type="checkbox" class="setting-checkbox" id="allowSelfSigned"
                                               ${settings.security.allowSelfSigned ? 'checked' : ''}>
                                    </div>
                                </div>

                                <div class="setting-item">
                                    <div class="setting-label">
                                        <div>Security Level</div>
                                        <div class="setting-description">How strict security validation should be</div>
                                    </div>
                                    <div class="setting-control">
                                        <select class="setting-select" id="securityLevel">
                                            <option value="strict" ${settings.security.securityLevel === 'strict' ? 'selected' : ''}>Strict</option>
                                            <option value="warning" ${settings.security.securityLevel === 'warning' ? 'selected' : ''}>Warning</option>
                                            <option value="permissive" ${settings.security.securityLevel === 'permissive' ? 'selected' : ''}>Permissive</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Theme Settings -->
                        <div class="settings-section">
                            <div class="section-header">
                                <h3 class="section-title">Theme & UI</h3>
                            </div>
                            <div class="section-content">
                                <div class="setting-item">
                                    <div class="setting-label">
                                        <div>Color Scheme</div>
                                        <div class="setting-description">Color scheme for the extension interface</div>
                                    </div>
                                    <div class="setting-control">
                                        <select class="setting-select" id="colorScheme">
                                            <option value="auto" ${settings.theme.colorScheme === 'auto' ? 'selected' : ''}>Auto</option>
                                            <option value="light" ${settings.theme.colorScheme === 'light' ? 'selected' : ''}>Light</option>
                                            <option value="dark" ${settings.theme.colorScheme === 'dark' ? 'selected' : ''}>Dark</option>
                                        </select>
                                    </div>
                                </div>

                                <div class="setting-item">
                                    <div class="setting-label">
                                        <div>Compact Mode</div>
                                        <div class="setting-description">Use compact layout for UI elements</div>
                                    </div>
                                    <div class="setting-control">
                                        <input type="checkbox" class="setting-checkbox" id="compactMode"
                                               ${settings.theme.compactMode ? 'checked' : ''}>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Debug Settings -->
                        <div class="settings-section">
                            <div class="section-header">
                                <h3 class="section-title">Debug & Logging</h3>
                            </div>
                            <div class="section-content">
                                <div class="setting-item">
                                    <div class="setting-label">
                                        <div>Debug Logging</div>
                                        <div class="setting-description">Enable detailed debug logging</div>
                                    </div>
                                    <div class="setting-control">
                                        <input type="checkbox" class="setting-checkbox" id="debugEnabled"
                                               ${settings.debug.enabled ? 'checked' : ''}>
                                    </div>
                                </div>

                                <div class="setting-item">
                                    <div class="setting-label">
                                        <div>Log Level</div>
                                        <div class="setting-description">Minimum level for log messages</div>
                                    </div>
                                    <div class="setting-control">
                                        <select class="setting-select" id="logLevel">
                                            <option value="trace" ${settings.debug.logLevel === 'trace' ? 'selected' : ''}>Trace</option>
                                            <option value="debug" ${settings.debug.logLevel === 'debug' ? 'selected' : ''}>Debug</option>
                                            <option value="info" ${settings.debug.logLevel === 'info' ? 'selected' : ''}>Info</option>
                                            <option value="warn" ${settings.debug.logLevel === 'warn' ? 'selected' : ''}>Warning</option>
                                            <option value="error" ${settings.debug.logLevel === 'error' ? 'selected' : ''}>Error</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="footer">
                    <div class="info">
                        Settings are automatically saved to VS Code configuration
                    </div>
                    <div class="actions">
                        <button class="btn btn-secondary" onclick="exportSettings()">Export</button>
                        <button class="btn btn-secondary" onclick="importSettings()">Import</button>
                        <button class="btn btn-primary" onclick="saveSettings()">Save Settings</button>
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();

                    function collectSettings() {
                        return {
                            compare: {
                                mode: document.getElementById('compareMode').value,
                                ignoreSchemas: Array.from(document.querySelectorAll('#ignoreSchemas .array-input')).map(input => input.value),
                                includeSystemObjects: document.getElementById('includeSystemObjects').checked,
                                caseSensitive: document.getElementById('caseSensitive').checked
                            },
                            migration: {
                                dryRun: document.getElementById('dryRun').checked,
                                batchSize: parseInt(document.getElementById('batchSize').value),
                                stopOnError: document.getElementById('stopOnError').checked,
                                transactionMode: document.getElementById('transactionMode').value
                            },
                            security: {
                                certificateValidation: document.getElementById('certificateValidation').checked,
                                allowSelfSigned: document.getElementById('allowSelfSigned').checked,
                                securityLevel: document.getElementById('securityLevel').value
                            },
                            theme: {
                                colorScheme: document.getElementById('colorScheme').value,
                                compactMode: document.getElementById('compactMode').checked
                            },
                            debug: {
                                enabled: document.getElementById('debugEnabled').checked,
                                logLevel: document.getElementById('logLevel').value
                            }
                        };
                    }

                    function saveSettings() {
                        const settings = collectSettings();
                        vscode.postMessage({
                            command: 'saveSettings',
                            settings: settings
                        });
                    }

                    function resetToDefaults() {
                        if (confirm('Reset all settings to defaults? This cannot be undone.')) {
                            vscode.postMessage({
                                command: 'resetToDefaults'
                            });
                        }
                    }

                    function exportSettings() {
                        const settings = collectSettings();
                        const dataStr = JSON.stringify(settings, null, 2);
                        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

                        const exportFileDefaultName = 'postgresql-extension-settings.json';

                        const linkElement = document.createElement('a');
                        linkElement.setAttribute('href', dataUri);
                        linkElement.setAttribute('download', exportFileDefaultName);
                        linkElement.click();
                    }

                    function importSettings() {
                        vscode.postMessage({
                            command: 'importSettings'
                        });
                    }

                    function addArrayItem(arrayId) {
                        const container = document.getElementById(arrayId);
                        const itemDiv = document.createElement('div');
                        itemDiv.className = 'array-item';
                        itemDiv.innerHTML = \`
                            <input type="text" class="array-input" placeholder="Schema name">
                            <button class="remove-btn" onclick="removeArrayItem(this)">×</button>
                        \`;
                        container.appendChild(itemDiv);
                    }

                    function removeArrayItem(button) {
                        button.parentElement.remove();
                    }

                    // Auto-save on changes (optional)
                    let autoSaveTimeout;
                    function scheduleAutoSave() {
                        clearTimeout(autoSaveTimeout);
                        autoSaveTimeout = setTimeout(() => {
                            saveSettings();
                        }, 2000); // Auto-save after 2 seconds of inactivity
                    }

                    // Add change listeners
                    document.querySelectorAll('input, select').forEach(element => {
                        element.addEventListener('change', scheduleAutoSave);
                    });

                    document.querySelectorAll('.array-input').forEach(element => {
                        element.addEventListener('input', scheduleAutoSave);
                    });
                </script>
            </body>
            </html>
        `;
    }

    private async handleWebviewMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'saveSettings':
                await this.saveSettings(message.settings);
                break;
            case 'resetToDefaults':
                await this.resetToDefaults();
                break;
            case 'importSettings':
                await this.importSettings();
                break;
        }
    }

    private async resetToDefaults(): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('postgresql-schema-sync');

            // Reset all settings to defaults
            await config.update('compare.mode', undefined);
            await config.update('compare.ignoreSchemas', undefined);
            await config.update('compare.includeSystemObjects', undefined);
            await config.update('compare.caseSensitive', undefined);

            await config.update('migration.dryRun', undefined);
            await config.update('migration.batchSize', undefined);
            await config.update('migration.stopOnError', undefined);
            await config.update('migration.transactionMode', undefined);

            await config.update('security.certificateValidation', undefined);
            await config.update('security.allowSelfSigned', undefined);
            await config.update('security.securityLevel', undefined);

            await config.update('theme.colorScheme', undefined);
            await config.update('theme.compactMode', undefined);

            await config.update('debug.enabled', undefined);
            await config.update('debug.logLevel', undefined);

            this.settings = this.loadSettings();

            // Refresh the webview
            if (this.panel) {
                const htmlContent = await this.generateSettingsHtml(this.settings);
                this.panel.webview.html = htmlContent;
            }

            Logger.info('Settings reset to defaults', 'resetToDefaults');
            vscode.window.showInformationMessage('Settings reset to defaults');

        } catch (error) {
            Logger.error('Failed to reset settings', error as Error, 'resetToDefaults');
            vscode.window.showErrorMessage('Failed to reset settings');
        }
    }

    private async importSettings(): Promise<void> {
        try {
            const uri = await vscode.window.showOpenDialog({
                filters: {
                    'JSON Files': ['json'],
                    'All Files': ['*']
                },
                openLabel: 'Import Settings'
            });

            if (uri && uri[0]) {
                const content = await vscode.workspace.fs.readFile(uri[0]);
                const importedSettings = JSON.parse(content.toString());

                await this.saveSettings(importedSettings);
                vscode.window.showInformationMessage('Settings imported successfully');
            }
        } catch (error) {
            Logger.error('Failed to import settings', error as Error, 'importSettings');
            vscode.window.showErrorMessage('Failed to import settings');
        }
    }

    dispose(): void {
        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }
    }
}
