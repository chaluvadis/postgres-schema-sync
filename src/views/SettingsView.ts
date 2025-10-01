import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';

export interface ExtensionSettings {
    compare: {
        mode: 'strict' | 'lenient';
        ignoreSchemas: string[];
    };
    migration: {
        dryRun: boolean;
        batchSize: number;
    };
    notifications: {
        enabled: boolean;
    };
    theme: {
        colorScheme: 'auto' | 'light' | 'dark';
    };
    debug: {
        enabled: boolean;
        logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error';
    };
}

export class SettingsView {
    async showSettings(): Promise<void> {
        try {
            Logger.info('Opening settings view');

            const panel = vscode.window.createWebviewPanel(
                'extensionSettings',
                'PostgreSQL Schema Sync - Settings',
                vscode.ViewColumn.One,
                { enableScripts: true, retainContextWhenHidden: true }
            );

            const currentSettings = await this.getCurrentSettings();
            const settingsHtml = await this.generateSettingsHtml(currentSettings);
            panel.webview.html = settingsHtml;

            // Handle messages from webview
            panel.webview.onDidReceiveMessage(async (message) => {
                switch (message.command) {
                    case 'saveSettings':
                        await this.handleSaveSettings(message.settings);
                        break;
                    case 'resetSettings':
                        await this.handleResetSettings(panel);
                        break;
                    case 'exportSettings':
                        await this.handleExportSettings(currentSettings);
                        break;
                    case 'importSettings':
                        await this.handleImportSettings(panel);
                        break;
                }
            });
        } catch (error) {
            Logger.error('Failed to show settings', error as Error);
            vscode.window.showErrorMessage(
                `Failed to open settings: ${(error as Error).message}`
            );
        }
    }

    private async getCurrentSettings(): Promise<ExtensionSettings> {
        const config = vscode.workspace.getConfiguration('postgresql-schema-sync');

        return {
            compare: {
                mode: config.get('compare.mode', 'strict'),
                ignoreSchemas: config.get('compare.ignoreSchemas', ['information_schema', 'pg_catalog', 'pg_toast'])
            },
            migration: {
                dryRun: config.get('migration.dryRun', true),
                batchSize: config.get('migration.batchSize', 50)
            },
            notifications: {
                enabled: config.get('notifications.enabled', true)
            },
            theme: {
                colorScheme: config.get('theme.colorScheme', 'auto')
            },
            debug: {
                enabled: config.get('debug.enabled', false),
                logLevel: config.get('debug.logLevel', 'info')
            }
        };
    }

    private async generateSettingsHtml(settings: ExtensionSettings): Promise<string> {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Extension Settings</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 20px;
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                    }
                    .header {
                        margin-bottom: 30px;
                        padding-bottom: 15px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }
                    .settings-section {
                        margin-bottom: 30px;
                        padding: 20px;
                        background: var(--vscode-textBlockQuote-background);
                        border: 1px solid var(--vscode-textBlockQuote-border);
                        border-radius: 6px;
                    }
                    .section-title {
                        margin: 0 0 15px 0;
                        color: var(--vscode-textLink-foreground);
                        font-size: 16px;
                        font-weight: bold;
                    }
                    .setting-group {
                        margin-bottom: 20px;
                    }
                    .setting-label {
                        display: block;
                        margin-bottom: 8px;
                        font-weight: bold;
                        color: var(--vscode-textLink-foreground);
                    }
                    .setting-description {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                        margin-bottom: 10px;
                    }
                    .setting-control {
                        margin-bottom: 15px;
                    }
                    .form-group {
                        margin-bottom: 15px;
                    }
                    .form-group label {
                        display: block;
                        margin-bottom: 5px;
                        font-weight: bold;
                    }
                    .form-group input, .form-group select, .form-group textarea {
                        width: 100%;
                        padding: 8px;
                        border: 1px solid var(--vscode-input-border);
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border-radius: 4px;
                        box-sizing: border-box;
                    }
                    .checkbox-group {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }
                    .checkbox-group input[type="checkbox"] {
                        width: auto;
                        margin: 0;
                    }
                    .tag-container {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 8px;
                        margin-top: 8px;
                    }
                    .tag {
                        background: var(--vscode-badge-background);
                        color: var(--vscode-badge-foreground);
                        padding: 4px 8px;
                        border-radius: 12px;
                        font-size: 12px;
                        display: flex;
                        align-items: center;
                        gap: 5px;
                    }
                    .tag-remove {
                        cursor: pointer;
                        font-weight: bold;
                        margin-left: 5px;
                    }
                    .tag-input-container {
                        display: flex;
                        gap: 8px;
                        margin-top: 8px;
                    }
                    .tag-input {
                        flex: 1;
                        padding: 6px;
                        border: 1px solid var(--vscode-input-border);
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border-radius: 4px;
                        font-size: 12px;
                    }
                    .btn {
                        padding: 8px 16px;
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
                    .btn-small {
                        padding: 6px 12px;
                        font-size: 12px;
                    }
                    .actions {
                        margin-top: 30px;
                        display: flex;
                        gap: 10px;
                        justify-content: flex-end;
                    }
                    .status-message {
                        margin-top: 15px;
                        padding: 10px;
                        border-radius: 4px;
                        font-size: 12px;
                    }
                    .status-success {
                        background: var(--vscode-notificationsInfoBackground);
                        color: var(--vscode-notificationsInfoForeground);
                    }
                    .status-error {
                        background: var(--vscode-notificationsErrorBackground);
                        color: var(--vscode-notificationsErrorForeground);
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h2>PostgreSQL Schema Sync - Settings</h2>
                    <p>Configure extension behavior and preferences</p>
                </div>

                <form id="settingsForm">
                    <!-- Comparison Settings -->
                    <div class="settings-section">
                        <h3 class="section-title">Schema Comparison</h3>

                        <div class="setting-group">
                            <div class="setting-label">Comparison Mode</div>
                            <div class="setting-description">Choose how strictly to compare database schemas</div>
                            <div class="setting-control">
                                <select id="compareMode" name="compareMode">
                                    <option value="strict" ${settings.compare.mode === 'strict' ? 'selected' : ''}>
                                        Strict - Exact match including whitespace and formatting
                                    </option>
                                    <option value="lenient" ${settings.compare.mode === 'lenient' ? 'selected' : ''}>
                                        Lenient - Ignore formatting differences and focus on structure
                                    </option>
                                </select>
                            </div>
                        </div>

                        <div class="setting-group">
                            <div class="setting-label">Ignore Schemas</div>
                            <div class="setting-description">Schemas to exclude from comparison operations</div>
                            <div class="setting-control">
                                <div class="tag-container" id="ignoreSchemasTags">
                                    ${settings.compare.ignoreSchemas.map(schema =>
                                        `<div class="tag">
                                            ${schema}
                                            <span class="tag-remove" onclick="removeIgnoreSchema('${schema}')">×</span>
                                        </div>`
                                    ).join('')}
                                </div>
                                <div class="tag-input-container">
                                    <input type="text" id="ignoreSchemaInput" class="tag-input" placeholder="Add schema to ignore...">
                                    <button type="button" class="btn btn-small btn-secondary" onclick="addIgnoreSchema()">Add</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Migration Settings -->
                    <div class="settings-section">
                        <h3 class="section-title">Migration</h3>

                        <div class="setting-group">
                            <div class="checkbox-group">
                                <input type="checkbox" id="migrationDryRun" name="migrationDryRun"
                                       ${settings.migration.dryRun ? 'checked' : ''}>
                                <label for="migrationDryRun">Enable Dry Run Mode</label>
                            </div>
                            <div class="setting-description">Preview migration changes without executing them</div>
                        </div>

                        <div class="setting-group">
                            <div class="setting-label">Batch Size</div>
                            <div class="setting-description">Number of operations to include in each migration batch</div>
                            <div class="setting-control">
                                <input type="number" id="migrationBatchSize" name="migrationBatchSize"
                                       value="${settings.migration.batchSize}" min="10" max="200">
                            </div>
                        </div>
                    </div>

                    <!-- Notification Settings -->
                    <div class="settings-section">
                        <h3 class="section-title">Notifications</h3>

                        <div class="setting-group">
                            <div class="checkbox-group">
                                <input type="checkbox" id="notificationsEnabled" name="notificationsEnabled"
                                       ${settings.notifications.enabled ? 'checked' : ''}>
                                <label for="notificationsEnabled">Enable Notifications</label>
                            </div>
                            <div class="setting-description">Show toast notifications for operation status</div>
                        </div>
                    </div>

                    <!-- Theme Settings -->
                    <div class="settings-section">
                        <h3 class="section-title">Theme</h3>

                        <div class="setting-group">
                            <div class="setting-label">Color Scheme</div>
                            <div class="setting-description">Choose the color scheme for the extension interface</div>
                            <div class="setting-control">
                                <select id="themeColorScheme" name="themeColorScheme">
                                    <option value="auto" ${settings.theme.colorScheme === 'auto' ? 'selected' : ''}>
                                        Auto - Match VSCode theme
                                    </option>
                                    <option value="light" ${settings.theme.colorScheme === 'light' ? 'selected' : ''}>
                                        Light - Light theme
                                    </option>
                                    <option value="dark" ${settings.theme.colorScheme === 'dark' ? 'selected' : ''}>
                                        Dark - Dark theme
                                    </option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- Debug Settings -->
                    <div class="settings-section">
                        <h3 class="section-title">Debug</h3>

                        <div class="setting-group">
                            <div class="checkbox-group">
                                <input type="checkbox" id="debugEnabled" name="debugEnabled"
                                       ${settings.debug.enabled ? 'checked' : ''}>
                                <label for="debugEnabled">Enable Debug Logging</label>
                            </div>
                            <div class="setting-description">Enable detailed logging for troubleshooting</div>
                        </div>

                        <div class="setting-group">
                            <div class="setting-label">Log Level</div>
                            <div class="setting-description">Minimum level for log messages</div>
                            <div class="setting-control">
                                <select id="debugLogLevel" name="debugLogLevel">
                                    <option value="trace" ${settings.debug.logLevel === 'trace' ? 'selected' : ''}>Trace</option>
                                    <option value="debug" ${settings.debug.logLevel === 'debug' ? 'selected' : ''}>Debug</option>
                                    <option value="info" ${settings.debug.logLevel === 'info' ? 'selected' : ''}>Info</option>
                                    <option value="warn" ${settings.debug.logLevel === 'warn' ? 'selected' : ''}>Warning</option>
                                    <option value="error" ${settings.debug.logLevel === 'error' ? 'selected' : ''}>Error</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </form>

                <div class="actions">
                    <button class="btn btn-secondary" onclick="exportSettings()">Export Settings</button>
                    <button class="btn btn-secondary" onclick="importSettings()">Import Settings</button>
                    <button class="btn btn-secondary" onclick="resetSettings()">Reset to Defaults</button>
                    <button class="btn btn-primary" onclick="saveSettings()">Save Settings</button>
                </div>

                <div id="statusMessage" class="status-message" style="display: none;"></div>

                <script>
                    const vscode = acquireVsCodeApi();
                    let ignoreSchemas = ${JSON.stringify(settings.compare.ignoreSchemas)};

                    function saveSettings() {
                        const settings = {
                            compare: {
                                mode: document.getElementById('compareMode').value,
                                ignoreSchemas: ignoreSchemas
                            },
                            migration: {
                                dryRun: document.getElementById('migrationDryRun').checked,
                                batchSize: parseInt(document.getElementById('migrationBatchSize').value)
                            },
                            notifications: {
                                enabled: document.getElementById('notificationsEnabled').checked
                            },
                            theme: {
                                colorScheme: document.getElementById('themeColorScheme').value
                            },
                            debug: {
                                enabled: document.getElementById('debugEnabled').checked,
                                logLevel: document.getElementById('debugLogLevel').value
                            }
                        };

                        vscode.postMessage({
                            command: 'saveSettings',
                            settings: settings
                        });
                    }

                    function resetSettings() {
                        vscode.postMessage({
                            command: 'resetSettings'
                        });
                    }

                    function exportSettings() {
                        vscode.postMessage({
                            command: 'exportSettings'
                        });
                    }

                    function importSettings() {
                        vscode.postMessage({
                            command: 'importSettings'
                        });
                    }

                    function addIgnoreSchema() {
                        const input = document.getElementById('ignoreSchemaInput');
                        const schema = input.value.trim();

                        if (schema && !ignoreSchemas.includes(schema)) {
                            ignoreSchemas.push(schema);
                            updateIgnoreSchemasTags();
                            input.value = '';
                        }
                    }

                    function removeIgnoreSchema(schema) {
                        ignoreSchemas = ignoreSchemas.filter(s => s !== schema);
                        updateIgnoreSchemasTags();
                    }

                    function updateIgnoreSchemasTags() {
                        const container = document.getElementById('ignoreSchemasTags');
                        container.innerHTML = ignoreSchemas.map(schema =>
                            \`<div class="tag">
                                \${schema}
                                <span class="tag-remove" onclick="removeIgnoreSchema('\${schema}')">×</span>
                            </div>\`
                        ).join('');
                    }

                    // Handle Enter key in tag input
                    document.getElementById('ignoreSchemaInput').addEventListener('keypress', function(e) {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            addIgnoreSchema();
                        }
                    });

                    // Show status messages
                    window.addEventListener('message', event => {
                        const message = event.data;
                        const statusDiv = document.getElementById('statusMessage');

                        if (message.command === 'settingsSaved') {
                            statusDiv.textContent = 'Settings saved successfully!';
                            statusDiv.className = 'status-message status-success';
                            statusDiv.style.display = 'block';

                            setTimeout(() => {
                                statusDiv.style.display = 'none';
                            }, 3000);
                        } else if (message.command === 'settingsReset') {
                            location.reload();
                        }
                    });
                </script>
            </body>
            </html>
        `;
    }

    private async handleSaveSettings(newSettings: ExtensionSettings): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('postgresql-schema-sync');

            // Update configuration values
            await config.update('compare.mode', newSettings.compare.mode, vscode.ConfigurationTarget.Global);
            await config.update('compare.ignoreSchemas', newSettings.compare.ignoreSchemas, vscode.ConfigurationTarget.Global);
            await config.update('migration.dryRun', newSettings.migration.dryRun, vscode.ConfigurationTarget.Global);
            await config.update('migration.batchSize', newSettings.migration.batchSize, vscode.ConfigurationTarget.Global);
            await config.update('notifications.enabled', newSettings.notifications.enabled, vscode.ConfigurationTarget.Global);
            await config.update('theme.colorScheme', newSettings.theme.colorScheme, vscode.ConfigurationTarget.Global);
            await config.update('debug.enabled', newSettings.debug.enabled, vscode.ConfigurationTarget.Global);
            await config.update('debug.logLevel', newSettings.debug.logLevel, vscode.ConfigurationTarget.Global);

            vscode.window.showInformationMessage('Settings saved successfully');

        } catch (error) {
            Logger.error('Failed to save settings', error as Error);
            vscode.window.showErrorMessage('Failed to save settings');
        }
    }

    private async handleResetSettings(panel: vscode.WebviewPanel): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('postgresql-schema-sync');

            // Reset to default values
            await config.update('compare.mode', 'strict', vscode.ConfigurationTarget.Global);
            await config.update('compare.ignoreSchemas', ['information_schema', 'pg_catalog', 'pg_toast'], vscode.ConfigurationTarget.Global);
            await config.update('migration.dryRun', true, vscode.ConfigurationTarget.Global);
            await config.update('migration.batchSize', 50, vscode.ConfigurationTarget.Global);
            await config.update('notifications.enabled', true, vscode.ConfigurationTarget.Global);
            await config.update('theme.colorScheme', 'auto', vscode.ConfigurationTarget.Global);
            await config.update('debug.enabled', false, vscode.ConfigurationTarget.Global);
            await config.update('debug.logLevel', 'info', vscode.ConfigurationTarget.Global);

            vscode.window.showInformationMessage('Settings reset to defaults');

            // Reload the panel with default settings
            const defaultSettings = await this.getCurrentSettings();
            const settingsHtml = await this.generateSettingsHtml(defaultSettings);
            panel.webview.html = settingsHtml;

        } catch (error) {
            Logger.error('Failed to reset settings', error as Error);
            vscode.window.showErrorMessage('Failed to reset settings');
        }
    }

    private async handleExportSettings(settings: ExtensionSettings): Promise<void> {
        try {
            const content = JSON.stringify(settings, null, 2);
            const uri = await vscode.window.showSaveDialog({
                filters: {
                    'JSON Files': ['json'],
                    'All Files': ['*']
                },
                defaultUri: vscode.Uri.file('postgresql-schema-sync-settings.json')
            });

            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
                vscode.window.showInformationMessage('Settings exported successfully');
            }
        } catch (error) {
            Logger.error('Failed to export settings', error as Error);
            vscode.window.showErrorMessage('Failed to export settings');
        }
    }

    private async handleImportSettings(panel: vscode.WebviewPanel): Promise<void> {
        try {
            const uri = await vscode.window.showOpenDialog({
                filters: {
                    'JSON Files': ['json'],
                    'All Files': ['*']
                },
                canSelectMany: false
            });

            if (uri && uri[0]) {
                const content = await vscode.workspace.fs.readFile(uri[0]);
                const importedSettings = JSON.parse(content.toString());

                // Validate imported settings
                if (this.validateSettings(importedSettings)) {
                    await this.handleSaveSettings(importedSettings);
                    vscode.window.showInformationMessage('Settings imported successfully');

                    // Reload the panel with imported settings
                    const settingsHtml = await this.generateSettingsHtml(importedSettings);
                    panel.webview.html = settingsHtml;
                } else {
                    vscode.window.showErrorMessage('Invalid settings file format');
                }
            }
        } catch (error) {
            Logger.error('Failed to import settings', error as Error);
            vscode.window.showErrorMessage('Failed to import settings');
        }
    }

    private validateSettings(settings: any): boolean {
        try {
            // Basic validation
            if (!settings || typeof settings !== 'object') {
                return false;
            }

            // Check required sections
            const requiredSections = ['compare', 'migration', 'notifications', 'theme', 'debug'];
            for (const section of requiredSections) {
                if (!settings[section] || typeof settings[section] !== 'object') {
                    return false;
                }
            }

            return true;
        } catch {
            return false;
        }
    }
}