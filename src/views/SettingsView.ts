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
    connectionPooling: {
        enabled: boolean;
        minPoolSize: number;
        maxPoolSize: number;
        acquireTimeoutMs: number;
        idleTimeoutMs: number;
        healthCheckIntervalMs: number;
        maxConnectionAgeMs: number;
        enableDynamicSizing: boolean;
        loadThresholdForScaling: number;
        enableConnectionLeasing: boolean;
        leaseTimeoutMs: number;
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
                    default:
                        Logger.warn('Unknown settings command', { command: message.command });
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
            },
            connectionPooling: {
                enabled: config.get('connectionPooling.enabled', true),
                minPoolSize: config.get('connectionPooling.minPoolSize', 2),
                maxPoolSize: config.get('connectionPooling.maxPoolSize', 20),
                acquireTimeoutMs: config.get('connectionPooling.acquireTimeoutMs', 30000),
                idleTimeoutMs: config.get('connectionPooling.idleTimeoutMs', 300000),
                healthCheckIntervalMs: config.get('connectionPooling.healthCheckIntervalMs', 60000),
                maxConnectionAgeMs: config.get('connectionPooling.maxConnectionAgeMs', 3600000),
                enableDynamicSizing: config.get('connectionPooling.enableDynamicSizing', true),
                loadThresholdForScaling: config.get('connectionPooling.loadThresholdForScaling', 0.8),
                enableConnectionLeasing: config.get('connectionPooling.enableConnectionLeasing', true),
                leaseTimeoutMs: config.get('connectionPooling.leaseTimeoutMs', 300000)
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
                    .error-input {
                        border-color: var(--vscode-errorForeground);
                        background: var(--vscode-inputValidation-errorBackground);
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

                    <!-- Connection Pooling Settings -->
                    <div class="settings-section">
                        <h3 class="section-title">Connection Pooling</h3>

                        <div class="setting-group">
                            <div class="checkbox-group">
                                <input type="checkbox" id="connectionPoolingEnabled" name="connectionPoolingEnabled"
                                       ${settings.connectionPooling.enabled ? 'checked' : ''}>
                                <label for="connectionPoolingEnabled">Enable Connection Pooling</label>
                            </div>
                            <div class="setting-description">Enable connection pooling for improved performance</div>
                        </div>

                        <div class="setting-group">
                            <div class="setting-label">Minimum Pool Size</div>
                            <div class="setting-description">Minimum number of connections to maintain in the pool</div>
                            <div class="setting-control">
                                <input type="number" id="minPoolSize" name="minPoolSize"
                                       value="${settings.connectionPooling.minPoolSize}" min="1" max="50">
                            </div>
                        </div>

                        <div class="setting-group">
                            <div class="setting-label">Maximum Pool Size</div>
                            <div class="setting-description">Maximum number of connections allowed in the pool</div>
                            <div class="setting-control">
                                <input type="number" id="maxPoolSize" name="maxPoolSize"
                                       value="${settings.connectionPooling.maxPoolSize}" min="5" max="100">
                            </div>
                        </div>

                        <div class="setting-group">
                            <div class="setting-label">Acquire Timeout (ms)</div>
                            <div class="setting-description">Maximum time to wait for acquiring a connection</div>
                            <div class="setting-control">
                                <input type="number" id="acquireTimeoutMs" name="acquireTimeoutMs"
                                       value="${settings.connectionPooling.acquireTimeoutMs}" min="5000" max="120000">
                            </div>
                        </div>

                        <div class="setting-group">
                            <div class="setting-label">Idle Timeout (ms)</div>
                            <div class="setting-description">Maximum idle time before closing a connection</div>
                            <div class="setting-control">
                                <input type="number" id="idleTimeoutMs" name="idleTimeoutMs"
                                       value="${settings.connectionPooling.idleTimeoutMs}" min="60000" max="3600000">
                            </div>
                        </div>

                        <div class="setting-group">
                            <div class="setting-label">Health Check Interval (ms)</div>
                            <div class="setting-description">Interval between connection health checks</div>
                            <div class="setting-control">
                                <input type="number" id="healthCheckIntervalMs" name="healthCheckIntervalMs"
                                       value="${settings.connectionPooling.healthCheckIntervalMs}" min="10000" max="300000">
                            </div>
                        </div>

                        <div class="setting-group">
                            <div class="setting-label">Max Connection Age (ms)</div>
                            <div class="setting-description">Maximum age of a connection before replacement</div>
                            <div class="setting-control">
                                <input type="number" id="maxConnectionAgeMs" name="maxConnectionAgeMs"
                                       value="${settings.connectionPooling.maxConnectionAgeMs}" min="300000" max="86400000">
                            </div>
                        </div>

                        <div class="setting-group">
                            <div class="checkbox-group">
                                <input type="checkbox" id="enableDynamicSizing" name="enableDynamicSizing"
                                       ${settings.connectionPooling.enableDynamicSizing ? 'checked' : ''}>
                                <label for="enableDynamicSizing">Enable Dynamic Sizing</label>
                            </div>
                            <div class="setting-description">Automatically adjust pool size based on load</div>
                        </div>

                        <div class="setting-group">
                            <div class="setting-label">Load Threshold for Scaling</div>
                            <div class="setting-description">Pool utilization percentage that triggers scaling (0.1-0.9)</div>
                            <div class="setting-control">
                                <input type="number" id="loadThresholdForScaling" name="loadThresholdForScaling"
                                       value="${settings.connectionPooling.loadThresholdForScaling}" min="0.1" max="0.9" step="0.1">
                            </div>
                        </div>

                        <div class="setting-group">
                            <div class="checkbox-group">
                                <input type="checkbox" id="enableConnectionLeasing" name="enableConnectionLeasing"
                                       ${settings.connectionPooling.enableConnectionLeasing ? 'checked' : ''}>
                                <label for="enableConnectionLeasing">Enable Connection Leasing</label>
                            </div>
                            <div class="setting-description">Allow long-term connection leasing for extended operations</div>
                        </div>

                        <div class="setting-group">
                            <div class="setting-label">Lease Timeout (ms)</div>
                            <div class="setting-description">Maximum time a leased connection can be held</div>
                            <div class="setting-control">
                                <input type="number" id="leaseTimeoutMs" name="leaseTimeoutMs"
                                       value="${settings.connectionPooling.leaseTimeoutMs}" min="60000" max="3600000">
                            </div>
                        </div>
                    </div>
                </form>

                <div class="actions">
                    <button class="btn btn-secondary" onclick="exportSettings()">Export Settings</button>
                    <button class="btn btn-secondary" onclick="importSettings()">Import Settings</button>
                    <button class="btn btn-secondary" onclick="resetSettings()">Reset to Defaults</button>
                    <button class="btn btn-primary" onclick="validateAndSaveSettings()">Save Settings</button>
                </div>

                <div id="statusMessage" class="status-message" style="display: none;"></div>

                <script>
                    const vscode = acquireVsCodeApi();
                    let ignoreSchemas = ${JSON.stringify(settings.compare.ignoreSchemas)};

                    function validateAndSaveSettings() {
                        // Clear previous validation errors
                        clearValidationErrors();

                        // Validate form
                        const validationErrors = validateForm();

                        if (validationErrors.length > 0) {
                            showValidationErrors(validationErrors);
                            return;
                        }

                        // If validation passes, save settings
                        saveSettings();
                    }

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
                            },
                            connectionPooling: {
                                enabled: document.getElementById('connectionPoolingEnabled').checked,
                                minPoolSize: parseInt(document.getElementById('minPoolSize').value),
                                maxPoolSize: parseInt(document.getElementById('maxPoolSize').value),
                                acquireTimeoutMs: parseInt(document.getElementById('acquireTimeoutMs').value),
                                idleTimeoutMs: parseInt(document.getElementById('idleTimeoutMs').value),
                                healthCheckIntervalMs: parseInt(document.getElementById('healthCheckIntervalMs').value),
                                maxConnectionAgeMs: parseInt(document.getElementById('maxConnectionAgeMs').value),
                                enableDynamicSizing: document.getElementById('enableDynamicSizing').checked,
                                loadThresholdForScaling: parseFloat(document.getElementById('loadThresholdForScaling').value),
                                enableConnectionLeasing: document.getElementById('enableConnectionLeasing').checked,
                                leaseTimeoutMs: parseInt(document.getElementById('leaseTimeoutMs').value)
                            }
                        };

                        vscode.postMessage({
                            command: 'saveSettings',
                            settings: settings
                        });
                    }

                    function validateForm() {
                        const errors = [];

                        // Validate migration batch size
                        const batchSize = parseInt(document.getElementById('migrationBatchSize').value);
                        if (isNaN(batchSize) || batchSize < 10 || batchSize > 200) {
                            errors.push('Migration batch size must be between 10 and 200');
                        }

                        // Validate pool sizes
                        const minPoolSize = parseInt(document.getElementById('minPoolSize').value);
                        const maxPoolSize = parseInt(document.getElementById('maxPoolSize').value);

                        if (isNaN(minPoolSize) || minPoolSize < 1 || minPoolSize > 50) {
                            errors.push('Minimum pool size must be between 1 and 50');
                        }

                        if (isNaN(maxPoolSize) || maxPoolSize < 5 || maxPoolSize > 100) {
                            errors.push('Maximum pool size must be between 5 and 100');
                        }

                        if (minPoolSize > maxPoolSize) {
                            errors.push('Minimum pool size cannot be greater than maximum pool size');
                        }

                        // Validate load threshold
                        const loadThreshold = parseFloat(document.getElementById('loadThresholdForScaling').value);
                        if (isNaN(loadThreshold) || loadThreshold < 0.1 || loadThreshold > 0.9) {
                            errors.push('Load threshold must be between 0.1 and 0.9');
                        }

                        return errors;
                    }

                    function clearValidationErrors() {
                        // Remove existing error messages
                        document.querySelectorAll('.validation-error').forEach(el => el.remove());

                        // Remove error styling
                        document.querySelectorAll('.error-input').forEach(el => {
                            el.classList.remove('error-input');
                        });
                    }

                    function showValidationErrors(errors) {
                        const statusDiv = document.getElementById('statusMessage');
                        statusDiv.innerHTML = errors.map(error => '<div>' + error + '</div>').join('');
                        statusDiv.className = 'status-message status-error';
                        statusDiv.style.display = 'block';

                        // Add error styling to invalid inputs
                        if (errors.some(e => e.includes('batch size'))) {
                            document.getElementById('migrationBatchSize').classList.add('error-input');
                        }
                        if (errors.some(e => e.includes('pool size'))) {
                            document.getElementById('minPoolSize').classList.add('error-input');
                            document.getElementById('maxPoolSize').classList.add('error-input');
                        }
                        if (errors.some(e => e.includes('threshold'))) {
                            document.getElementById('loadThresholdForScaling').classList.add('error-input');
                        }
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
                            '<div class="tag">' +
                                schema +
                                '<span class="tag-remove" onclick="removeIgnoreSchema(\'' + schema + '\')">×</span>' +
                            '</div>'
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
            if (!newSettings || typeof newSettings !== 'object') {
                throw new Error('Invalid settings object provided');
            }

            // Validate settings before saving
            this.validateSettingsForSaving(newSettings);

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

            // Update connection pooling configuration
            await config.update('connectionPooling.enabled', newSettings.connectionPooling.enabled, vscode.ConfigurationTarget.Global);
            await config.update('connectionPooling.minPoolSize', newSettings.connectionPooling.minPoolSize, vscode.ConfigurationTarget.Global);
            await config.update('connectionPooling.maxPoolSize', newSettings.connectionPooling.maxPoolSize, vscode.ConfigurationTarget.Global);
            await config.update('connectionPooling.acquireTimeoutMs', newSettings.connectionPooling.acquireTimeoutMs, vscode.ConfigurationTarget.Global);
            await config.update('connectionPooling.idleTimeoutMs', newSettings.connectionPooling.idleTimeoutMs, vscode.ConfigurationTarget.Global);
            await config.update('connectionPooling.healthCheckIntervalMs', newSettings.connectionPooling.healthCheckIntervalMs, vscode.ConfigurationTarget.Global);
            await config.update('connectionPooling.maxConnectionAgeMs', newSettings.connectionPooling.maxConnectionAgeMs, vscode.ConfigurationTarget.Global);
            await config.update('connectionPooling.enableDynamicSizing', newSettings.connectionPooling.enableDynamicSizing, vscode.ConfigurationTarget.Global);
            await config.update('connectionPooling.loadThresholdForScaling', newSettings.connectionPooling.loadThresholdForScaling, vscode.ConfigurationTarget.Global);
            await config.update('connectionPooling.enableConnectionLeasing', newSettings.connectionPooling.enableConnectionLeasing, vscode.ConfigurationTarget.Global);
            await config.update('connectionPooling.leaseTimeoutMs', newSettings.connectionPooling.leaseTimeoutMs, vscode.ConfigurationTarget.Global);

            vscode.window.showInformationMessage('Settings saved successfully');

        } catch (error) {
            Logger.error('Failed to save settings', error as Error);
            vscode.window.showErrorMessage(`Failed to save settings: ${(error as Error).message}`);
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

            // Reset connection pooling to defaults
            await config.update('connectionPooling.enabled', true, vscode.ConfigurationTarget.Global);
            await config.update('connectionPooling.minPoolSize', 2, vscode.ConfigurationTarget.Global);
            await config.update('connectionPooling.maxPoolSize', 20, vscode.ConfigurationTarget.Global);
            await config.update('connectionPooling.acquireTimeoutMs', 30000, vscode.ConfigurationTarget.Global);
            await config.update('connectionPooling.idleTimeoutMs', 300000, vscode.ConfigurationTarget.Global);
            await config.update('connectionPooling.healthCheckIntervalMs', 60000, vscode.ConfigurationTarget.Global);
            await config.update('connectionPooling.maxConnectionAgeMs', 3600000, vscode.ConfigurationTarget.Global);
            await config.update('connectionPooling.enableDynamicSizing', true, vscode.ConfigurationTarget.Global);
            await config.update('connectionPooling.loadThresholdForScaling', 0.8, vscode.ConfigurationTarget.Global);
            await config.update('connectionPooling.enableConnectionLeasing', true, vscode.ConfigurationTarget.Global);
            await config.update('connectionPooling.leaseTimeoutMs', 300000, vscode.ConfigurationTarget.Global);

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

    private validateSettingsForSaving(settings: ExtensionSettings): void {
        // Validate comparison settings
        if (!settings.compare || typeof settings.compare.mode !== 'string' ||
            !['strict', 'lenient'].includes(settings.compare.mode)) {
            throw new Error('Invalid comparison mode setting');
        }

        if (!Array.isArray(settings.compare.ignoreSchemas)) {
            throw new Error('Ignore schemas must be an array');
        }

        // Validate migration settings
        if (typeof settings.migration.dryRun !== 'boolean') {
            throw new Error('Migration dry run must be a boolean');
        }

        if (typeof settings.migration.batchSize !== 'number' ||
            settings.migration.batchSize < 10 || settings.migration.batchSize > 200) {
            throw new Error('Migration batch size must be between 10 and 200');
        }

        // Validate notification settings
        if (typeof settings.notifications.enabled !== 'boolean') {
            throw new Error('Notifications enabled must be a boolean');
        }

        // Validate theme settings
        if (!settings.theme || typeof settings.theme.colorScheme !== 'string' ||
            !['auto', 'light', 'dark'].includes(settings.theme.colorScheme)) {
            throw new Error('Invalid theme color scheme');
        }

        // Validate debug settings
        if (typeof settings.debug.enabled !== 'boolean') {
            throw new Error('Debug enabled must be a boolean');
        }

        if (!settings.debug || typeof settings.debug.logLevel !== 'string' ||
            !['trace', 'debug', 'info', 'warn', 'error'].includes(settings.debug.logLevel)) {
            throw new Error('Invalid debug log level');
        }

        // Validate connection pooling settings
        if (typeof settings.connectionPooling.enabled !== 'boolean') {
            throw new Error('Connection pooling enabled must be a boolean');
        }

        if (typeof settings.connectionPooling.minPoolSize !== 'number' ||
            settings.connectionPooling.minPoolSize < 1 || settings.connectionPooling.minPoolSize > 50) {
            throw new Error('Min pool size must be between 1 and 50');
        }

        if (typeof settings.connectionPooling.maxPoolSize !== 'number' ||
            settings.connectionPooling.maxPoolSize < 5 || settings.connectionPooling.maxPoolSize > 100) {
            throw new Error('Max pool size must be between 5 and 100');
        }

        if (settings.connectionPooling.minPoolSize > settings.connectionPooling.maxPoolSize) {
            throw new Error('Min pool size cannot be greater than max pool size');
        }

        // Validate timeout settings
        if (typeof settings.connectionPooling.acquireTimeoutMs !== 'number' ||
            settings.connectionPooling.acquireTimeoutMs < 1000) {
            throw new Error('Acquire timeout must be at least 1000ms');
        }

        if (typeof settings.connectionPooling.idleTimeoutMs !== 'number' ||
            settings.connectionPooling.idleTimeoutMs < 1000) {
            throw new Error('Idle timeout must be at least 1000ms');
        }

        if (typeof settings.connectionPooling.healthCheckIntervalMs !== 'number' ||
            settings.connectionPooling.healthCheckIntervalMs < 1000) {
            throw new Error('Health check interval must be at least 1000ms');
        }

        if (typeof settings.connectionPooling.maxConnectionAgeMs !== 'number' ||
            settings.connectionPooling.maxConnectionAgeMs < 1000) {
            throw new Error('Max connection age must be at least 1000ms');
        }

        if (typeof settings.connectionPooling.leaseTimeoutMs !== 'number' ||
            settings.connectionPooling.leaseTimeoutMs < 1000) {
            throw new Error('Lease timeout must be at least 1000ms');
        }

        // Validate load threshold
        if (typeof settings.connectionPooling.loadThresholdForScaling !== 'number' ||
            settings.connectionPooling.loadThresholdForScaling < 0.1 ||
            settings.connectionPooling.loadThresholdForScaling > 0.9) {
            throw new Error('Load threshold must be between 0.1 and 0.9');
        }
    }
}