import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../utils/Logger';
import { TemplateEngine } from './utils/TemplateEngine';

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
    private templateEngine: TemplateEngine;

    constructor(extensionPath?: string) {
        this.templateEngine = new TemplateEngine(extensionPath || '');
    }

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

            // Load external files
            const cssContent = await this.templateEngine.loadCss('SettingsView.css');
            const jsContent = await this.templateEngine.loadJavaScript('SettingsView.js');

            // Prepare template data
            const templateData = {
                title: 'PostgreSQL Schema Sync - Settings',
                description: 'Configure extension behavior and preferences',
                cssContent: cssContent,
                jsContent: jsContent,
                cssPath: panel.webview.asWebviewUri(vscode.Uri.file(
                    path.join(this.templateEngine['templatesDir'], 'SettingsView.css')
                )).toString(),
                ...this.prepareTemplateData(currentSettings)
            };

            const settingsHtml = await this.templateEngine.render('SettingsView.html', templateData);
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

    private prepareTemplateData(settings: ExtensionSettings): any {
        return {
            // Comparison settings
            compareModeStrict: settings.compare.mode === 'strict' ? 'selected' : '',
            compareModeLenient: settings.compare.mode === 'lenient' ? 'selected' : '',

            // Migration settings
            migrationDryRunChecked: settings.migration.dryRun ? 'checked' : '',
            migrationBatchSize: settings.migration.batchSize,

            // Notification settings
            notificationsEnabledChecked: settings.notifications.enabled ? 'checked' : '',

            // Theme settings
            themeAutoSelected: settings.theme.colorScheme === 'auto' ? 'selected' : '',
            themeLightSelected: settings.theme.colorScheme === 'light' ? 'selected' : '',
            themeDarkSelected: settings.theme.colorScheme === 'dark' ? 'selected' : '',

            // Debug settings
            debugEnabledChecked: settings.debug.enabled ? 'checked' : '',
            logLevelTrace: settings.debug.logLevel === 'trace' ? 'selected' : '',
            logLevelDebug: settings.debug.logLevel === 'debug' ? 'selected' : '',
            logLevelInfo: settings.debug.logLevel === 'info' ? 'selected' : '',
            logLevelWarn: settings.debug.logLevel === 'warn' ? 'selected' : '',
            logLevelError: settings.debug.logLevel === 'error' ? 'selected' : '',

            // Connection pooling settings
            connectionPoolingEnabledChecked: settings.connectionPooling.enabled ? 'checked' : '',
            minPoolSize: settings.connectionPooling.minPoolSize,
            maxPoolSize: settings.connectionPooling.maxPoolSize,
            acquireTimeoutMs: settings.connectionPooling.acquireTimeoutMs,
            idleTimeoutMs: settings.connectionPooling.idleTimeoutMs,
            healthCheckIntervalMs: settings.connectionPooling.healthCheckIntervalMs,
            maxConnectionAgeMs: settings.connectionPooling.maxConnectionAgeMs,
            enableDynamicSizingChecked: settings.connectionPooling.enableDynamicSizing ? 'checked' : '',
            loadThresholdForScaling: settings.connectionPooling.loadThresholdForScaling,
            enableConnectionLeasingChecked: settings.connectionPooling.enableConnectionLeasing ? 'checked' : '',
            leaseTimeoutMs: settings.connectionPooling.leaseTimeoutMs,

            // Schema tags
            ignoreSchemasTags: settings.compare.ignoreSchemas.map(schema =>
                `<div class="tag">${schema}<span class="tag-remove" onclick="removeIgnoreSchema('${schema}')">×</span></div>`
            ).join('')
        };
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

                    // Reload the panel with imported settings to reflect changes in UI
                    try {
                        const updatedSettings = await this.getCurrentSettings();
                        const cssContent = await this.templateEngine.loadCss('SettingsView.css');
                        const jsContent = await this.templateEngine.loadJavaScript('SettingsView.js');

                        const templateData = {
                            title: 'PostgreSQL Schema Sync - Settings',
                            description: 'Configure extension behavior and preferences',
                            cssContent: cssContent,
                            jsContent: jsContent,
                            cssPath: panel.webview.asWebviewUri(vscode.Uri.file(
                                path.join(this.templateEngine['templatesDir'], 'SettingsView.css')
                            )).toString(),
                            ...this.prepareTemplateData(updatedSettings)
                        };

                        const settingsHtml = await this.templateEngine.render('SettingsView.html', templateData);
                        panel.webview.html = settingsHtml;

                        Logger.info('Settings view reloaded with imported settings');
                    } catch (reloadError) {
                        Logger.warn('Failed to reload settings view after import', reloadError as Error);
                        // Don't show error to user as import was successful
                    }
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
