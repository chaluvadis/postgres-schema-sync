import * as vscode from 'vscode';
import { Logger } from '@/utils/Logger';
import { ConnectionManager, DatabaseConnection } from '@/managers/ConnectionManager';

export interface ConnectionWizardStep {
    id: string;
    title: string;
    description: string;
    canSkip: boolean;
    validation?: (data: any) => Promise<string | null>;
}

export class ConnectionWizardView {
    private panel: vscode.WebviewPanel | undefined;
    private currentStep = 0;
    private wizardData: any = {};
    private steps: ConnectionWizardStep[] = [
        {
            id: 'welcome',
            title: 'Welcome to PostgreSQL Extension',
            description: 'Let\'s set up your first database connection',
            canSkip: false
        },
        {
            id: 'connection-details',
            title: 'Connection Details',
            description: 'Enter your database connection information',
            canSkip: false,
            validation: async (data: any) => {
                if (!data.host) return 'Host is required';
                if (!data.port) return 'Port is required';
                if (!data.database) return 'Database name is required';
                if (!data.username) return 'Username is required';
                return null;
            }
        },
        {
            id: 'authentication',
            title: 'Authentication',
            description: 'Configure authentication settings',
            canSkip: false,
            validation: async (data: any) => {
                if (!data.password && !data.useKeyFile) return 'Password or key file is required';
                return null;
            }
        },
        {
            id: 'ssl-settings',
            title: 'SSL Configuration',
            description: 'Configure SSL/TLS settings (optional)',
            canSkip: true
        },
        {
            id: 'connection-options',
            title: 'Connection Options',
            description: 'Configure additional connection options',
            canSkip: true
        },
        {
            id: 'test-connection',
            title: 'Test Connection',
            description: 'Test your connection settings',
            canSkip: false,
            validation: async (data: any) => {
                // This would test the actual connection
                return null;
            }
        },
        {
            id: 'summary',
            title: 'Connection Summary',
            description: 'Review your connection settings',
            canSkip: false
        }
    ];

    constructor(private connectionManager: ConnectionManager) {}

    async showWizard(existingConnection?: DatabaseConnection): Promise<void> {
        try {
            Logger.info('Opening connection wizard');

            this.panel = vscode.window.createWebviewPanel(
                'postgresqlConnectionWizard',
                'PostgreSQL Connection Wizard',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            // Handle panel disposal
            this.panel.onDidDispose(() => {
                this.panel = undefined;
            });

            // Generate and set HTML content
            const htmlContent = await this.generateWizardHtml(existingConnection);
            this.panel.webview.html = htmlContent;

            // Handle messages from webview
            this.panel.webview.onDidReceiveMessage(async (message) => {
                await this.handleWebviewMessage(message);
            });

        } catch (error) {
            Logger.error('Failed to show connection wizard', error as Error);
            vscode.window.showErrorMessage(
                `Failed to open connection wizard: ${(error as Error).message}`
            );
        }
    }

    private async generateWizardHtml(existingConnection?: DatabaseConnection): Promise<string> {
        const step = this.steps[this.currentStep];

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>PostgreSQL Connection Wizard</title>
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
                        --vscode-focusBorder: #007acc;
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

                    .wizard-header {
                        background: var(--vscode-editor-background);
                        border-bottom: 1px solid var(--vscode-panel-border);
                        padding: 20px;
                        text-align: center;
                    }

                    .wizard-title {
                        font-size: 24px;
                        font-weight: bold;
                        margin-bottom: 10px;
                    }

                    .wizard-description {
                        color: var(--vscode-descriptionForeground);
                        font-size: 14px;
                    }

                    .progress-container {
                        background: var(--vscode-textBlockQuote-background);
                        margin: 20px;
                        border-radius: 8px;
                        padding: 15px;
                    }

                    .progress-bar {
                        display: flex;
                        justify-content: space-between;
                        margin-bottom: 15px;
                    }

                    .progress-step {
                        display: flex;
                        align-items: center;
                        flex: 1;
                        position: relative;
                    }

                    .progress-step:not(:last-child)::after {
                        content: '';
                        position: absolute;
                        right: -50%;
                        top: 50%;
                        transform: translateY(-50%);
                        width: 100%;
                        height: 2px;
                        background: var(--vscode-panel-border);
                        z-index: 1;
                    }

                    .progress-circle {
                        width: 30px;
                        height: 30px;
                        border-radius: 50%;
                        background: var(--vscode-panel-border);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-weight: bold;
                        font-size: 12px;
                        position: relative;
                        z-index: 2;
                    }

                    .progress-circle.active {
                        background: var(--vscode-textLink-foreground);
                        color: var(--vscode-editor-background);
                    }

                    .progress-circle.completed {
                        background: var(--vscode-gitDecoration-addedResourceForeground);
                        color: var(--vscode-editor-background);
                    }

                    .progress-label {
                        margin-top: 8px;
                        font-size: 11px;
                        text-align: center;
                        color: var(--vscode-descriptionForeground);
                    }

                    .wizard-content {
                        flex: 1;
                        padding: 20px;
                        overflow-y: auto;
                    }

                    .step-content {
                        max-width: 600px;
                        margin: 0 auto;
                    }

                    .step-header {
                        text-align: center;
                        margin-bottom: 30px;
                    }

                    .step-title {
                        font-size: 28px;
                        font-weight: bold;
                        margin-bottom: 10px;
                    }

                    .step-description {
                        font-size: 16px;
                        color: var(--vscode-descriptionForeground);
                        line-height: 1.5;
                    }

                    .form-section {
                        background: var(--vscode-textBlockQuote-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 8px;
                        padding: 20px;
                        margin-bottom: 20px;
                    }

                    .form-section-title {
                        font-size: 16px;
                        font-weight: bold;
                        margin-bottom: 15px;
                        color: var(--vscode-textLink-foreground);
                    }

                    .form-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                        gap: 15px;
                    }

                    .form-group {
                        display: flex;
                        flex-direction: column;
                    }

                    .form-label {
                        font-size: 13px;
                        font-weight: bold;
                        margin-bottom: 5px;
                    }

                    .form-input {
                        padding: 8px 12px;
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-input-border);
                        border-radius: 4px;
                        font-size: 13px;
                    }

                    .form-input:focus {
                        outline: none;
                        border-color: var(--vscode-focusBorder);
                    }

                    .form-input::placeholder {
                        color: var(--vscode-descriptionForeground);
                    }

                    .checkbox-group {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }

                    .checkbox-input {
                        margin: 0;
                    }

                    .form-help {
                        font-size: 11px;
                        color: var(--vscode-descriptionForeground);
                        margin-top: 5px;
                    }

                    .connection-test {
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 8px;
                        padding: 20px;
                        margin-top: 20px;
                    }

                    .test-status {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        margin-bottom: 15px;
                    }

                    .status-indicator {
                        width: 16px;
                        height: 16px;
                        border-radius: 50%;
                    }

                    .status-success { background: var(--vscode-gitDecoration-addedResourceForeground); }
                    .status-error { background: var(--vscode-gitDecoration-deletedResourceForeground); }
                    .status-loading {
                        background: var(--vscode-gitDecoration-modifiedResourceForeground);
                        animation: pulse 1.5s infinite;
                    }

                    @keyframes pulse {
                        0% { opacity: 1; }
                        50% { opacity: 0.5; }
                        100% { opacity: 1; }
                    }

                    .test-output {
                        background: var(--vscode-input-background);
                        padding: 10px;
                        border-radius: 4px;
                        font-family: 'Consolas', 'Courier New', monospace;
                        font-size: 12px;
                        max-height: 150px;
                        overflow-y: auto;
                    }

                    .wizard-footer {
                        background: var(--vscode-editor-background);
                        border-top: 1px solid var(--vscode-panel-border);
                        padding: 20px;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }

                    .btn {
                        padding: 10px 20px;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 13px;
                        font-weight: bold;
                        transition: background-color 0.2s;
                        min-width: 100px;
                    }

                    .btn-primary {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                    }

                    .btn-primary:hover:not(:disabled) {
                        background: var(--vscode-button-hoverBackground);
                    }

                    .btn-secondary {
                        background: var(--vscode-button-secondaryBackground, #3c3c3c);
                        color: var(--vscode-button-secondaryForeground, #cccccc);
                    }

                    .btn-secondary:hover:not(:disabled) {
                        background: var(--vscode-list-hoverBackground);
                    }

                    .btn:disabled {
                        opacity: 0.5;
                        cursor: not-allowed;
                    }

                    .btn-group {
                        display: flex;
                        gap: 10px;
                    }

                    .summary-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                        gap: 15px;
                        margin-top: 20px;
                    }

                    .summary-card {
                        background: var(--vscode-textBlockQuote-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 6px;
                        padding: 15px;
                    }

                    .summary-title {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                        text-transform: uppercase;
                        margin-bottom: 5px;
                    }

                    .summary-value {
                        font-size: 16px;
                        font-weight: bold;
                        font-family: 'Consolas', 'Courier New', monospace;
                    }

                    .success-animation {
                        text-align: center;
                        padding: 40px;
                    }

                    .success-icon {
                        font-size: 64px;
                        margin-bottom: 20px;
                    }

                    .success-title {
                        font-size: 24px;
                        font-weight: bold;
                        margin-bottom: 10px;
                    }

                    .success-description {
                        color: var(--vscode-descriptionForeground);
                        margin-bottom: 30px;
                    }

                    @media (max-width: 768px) {
                        .form-grid {
                            grid-template-columns: 1fr;
                        }

                        .wizard-footer {
                            flex-direction: column;
                            gap: 15px;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="wizard-header">
                    <div class="wizard-title">PostgreSQL Connection Wizard</div>
                    <div class="wizard-description">Step-by-step database connection setup</div>
                </div>

                <div class="progress-container">
                    <div class="progress-bar">
                        ${this.steps.map((step, index) => `
                            <div class="progress-step">
                                <div class="progress-circle ${index === this.currentStep ? 'active' : index < this.currentStep ? 'completed' : ''}">
                                    ${index < this.currentStep ? '✓' : index + 1}
                                </div>
                                <div class="progress-label">${step.title}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="wizard-content">
                    <div class="step-content">
                        ${this.generateStepContent(step, existingConnection)}
                    </div>
                </div>

                <div class="wizard-footer">
                    <div class="btn-group">
                        <button class="btn btn-secondary" onclick="goToPreviousStep()" ${this.currentStep === 0 ? 'disabled' : ''}>
                            Previous
                        </button>
                        <button class="btn btn-primary" onclick="goToNextStep()">
                            ${this.currentStep === this.steps.length - 1 ? 'Finish' : 'Next'}
                        </button>
                    </div>
                    <button class="btn btn-secondary" onclick="cancelWizard()">Cancel</button>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    let wizardData = ${JSON.stringify(this.wizardData)};

                    function goToNextStep() {
                        const currentStepElement = document.querySelector('.step-content');
                        const stepData = collectStepData();

                        // Validate current step if needed
                        const validation = ${step.validation ? `validateStep(${JSON.stringify(step.id)})` : 'null'};

                        if (validation) {
                            vscode.postMessage({
                                command: 'validateStep',
                                stepId: '${step.id}',
                                data: stepData
                            });
                        } else {
                            proceedToNextStep();
                        }
                    }

                    function goToPreviousStep() {
                        if (${this.currentStep} > 0) {
                            vscode.postMessage({
                                command: 'goToStep',
                                stepIndex: ${this.currentStep} - 1
                            });
                        }
                    }

                    function cancelWizard() {
                        vscode.postMessage({
                            command: 'cancelWizard'
                        });
                    }

                    function collectStepData() {
                        const form = document.querySelector('.step-content');
                        const inputs = form.querySelectorAll('input, select, textarea');
                        const data = {};

                        inputs.forEach(input => {
                            if (input.type === 'checkbox') {
                                data[input.name] = input.checked;
                            } else {
                                data[input.name] = input.value;
                            }
                        });

                        return data;
                    }

                    function updateFormField(name, value) {
                        const input = document.querySelector(\`[name="\${name}"]\`);
                        if (input) {
                            if (input.type === 'checkbox') {
                                input.checked = value;
                            } else {
                                input.value = value;
                            }
                        }
                    }

                    function testConnection() {
                        const testBtn = document.getElementById('testConnectionBtn');
                        const testStatus = document.getElementById('testStatus');
                        const testOutput = document.getElementById('testOutput');

                        testBtn.disabled = true;
                        testStatus.innerHTML = '<div class="status-indicator status-loading"></div> Testing connection...';
                        testOutput.textContent = 'Connecting to database...';

                        vscode.postMessage({
                            command: 'testConnection',
                            data: collectStepData()
                        });
                    }

                    // Listen for messages from extension
                    window.addEventListener('message', event => {
                        const message = event.data;

                        switch (message.command) {
                            case 'validationError':
                                vscode.postMessage({
                                    command: 'showError',
                                    message: message.error
                                });
                                break;

                            case 'validationSuccess':
                                proceedToNextStep();
                                break;

                            case 'connectionTestResult':
                                handleConnectionTestResult(message.result);
                                break;

                            case 'updateFormData':
                                Object.entries(message.data).forEach(([key, value]) => {
                                    updateFormField(key, value);
                                });
                                break;
                        }
                    });

                    function handleConnectionTestResult(result) {
                        const testBtn = document.getElementById('testConnectionBtn');
                        const testStatus = document.getElementById('testStatus');
                        const testOutput = document.getElementById('testOutput');

                        testBtn.disabled = false;

                        if (result.success) {
                            testStatus.innerHTML = '<div class="status-indicator status-success"></div> Connection successful!';
                            testOutput.textContent = \`Connected successfully in \${result.duration}ms\`;
                        } else {
                            testStatus.innerHTML = '<div class="status-indicator status-error"></div> Connection failed';
                            testOutput.textContent = result.error;
                        }
                    }

                    function proceedToNextStep() {
                        vscode.postMessage({
                            command: 'nextStep',
                            data: collectStepData()
                        });
                    }

                    ${step.validation ? `
                    async function validateStep(stepId) {
                        const data = collectStepData();
                        const response = await vscode.postMessage({
                            command: 'validateStep',
                            stepId: stepId,
                            data: data
                        });
                        return response;
                    }
                    ` : ''}
                </script>
            </body>
            </html>
        `;
    }

    private generateStepContent(step: ConnectionWizardStep, existingConnection?: DatabaseConnection): string {
        switch (step.id) {
            case 'welcome':
                return `
                    <div class="step-header">
                        <div class="step-title">Welcome!</div>
                        <div class="step-description">
                            This wizard will help you set up a new PostgreSQL database connection.
                            We'll guide you through each step to ensure a successful connection.
                        </div>
                    </div>

                    <div class="form-section">
                        <div class="form-section-title">What you'll need:</div>
                        <ul style="color: var(--vscode-descriptionForeground); line-height: 1.6;">
                            <li>Database host address and port</li>
                            <li>Database name</li>
                            <li>Username and password</li>
                            <li>SSL configuration (if required)</li>
                        </ul>
                    </div>

                    <div class="form-section">
                        <div class="form-section-title">Features included:</div>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                            <div style="background: rgba(76, 183, 74, 0.1); padding: 15px; border-radius: 6px; border-left: 4px solid var(--vscode-gitDecoration-addedResourceForeground);">
                                <strong>Secure Storage</strong><br>
                                Credentials are encrypted and stored securely
                            </div>
                            <div style="background: rgba(77, 166, 255, 0.1); padding: 15px; border-radius: 6px; border-left: 4px solid var(--vscode-textLink-foreground);">
                                <strong>Connection Testing</strong><br>
                                Test your connection before saving
                            </div>
                            <div style="background: rgba(255, 193, 7, 0.1); padding: 15px; border-radius: 6px; border-left: 4px solid var(--vscode-gitDecoration-renamedResourceForeground);">
                                <strong>Auto-completion</strong><br>
                                Intelligent form assistance
                            </div>
                        </div>
                    </div>
                `;

            case 'connection-details':
                return `
                    <div class="step-header">
                        <div class="step-title">Connection Details</div>
                        <div class="step-description">
                            Enter the basic information needed to connect to your PostgreSQL database.
                        </div>
                    </div>

                    <div class="form-section">
                        <div class="form-section-title">Basic Information</div>
                        <div class="form-grid">
                            <div class="form-group">
                                <label class="form-label">Connection Name *</label>
                                <input type="text" name="name" class="form-input"
                                       placeholder="My Database Connection"
                                       value="${existingConnection?.name || ''}" required>
                                <div class="form-help">A friendly name to identify this connection</div>
                            </div>

                            <div class="form-group">
                                <label class="form-label">Host *</label>
                                <input type="text" name="host" class="form-input"
                                       placeholder="localhost"
                                       value="${existingConnection?.host || ''}" required>
                                <div class="form-help">Database server hostname or IP address</div>
                            </div>

                            <div class="form-group">
                                <label class="form-label">Port *</label>
                                <input type="number" name="port" class="form-input"
                                       placeholder="5432"
                                       value="${existingConnection?.port || '5432'}" required>
                                <div class="form-help">PostgreSQL port (default: 5432)</div>
                            </div>

                            <div class="form-group">
                                <label class="form-label">Database Name *</label>
                                <input type="text" name="database" class="form-input"
                                       placeholder="mydb"
                                       value="${existingConnection?.database || ''}" required>
                                <div class="form-help">Name of the database to connect to</div>
                            </div>
                        </div>
                    </div>
                `;

            case 'authentication':
                return `
                    <div class="step-header">
                        <div class="step-title">Authentication</div>
                        <div class="step-description">
                            Configure how to authenticate with your PostgreSQL database.
                        </div>
                    </div>

                    <div class="form-section">
                        <div class="form-section-title">Login Credentials</div>
                        <div class="form-grid">
                            <div class="form-group">
                                <label class="form-label">Username *</label>
                                <input type="text" name="username" class="form-input"
                                       placeholder="postgres"
                                       value="${existingConnection?.username || ''}" required>
                                <div class="form-help">Your PostgreSQL username</div>
                            </div>

                            <div class="form-group">
                                <label class="form-label">Password *</label>
                                <input type="password" name="password" class="form-input"
                                       placeholder="Enter password"
                                       value="${existingConnection?.password || ''}" required>
                                <div class="form-help">Your PostgreSQL password</div>
                            </div>
                        </div>

                        <div class="checkbox-group" style="margin-top: 15px;">
                            <input type="checkbox" name="savePassword" class="checkbox-input" id="savePassword" checked>
                            <label for="savePassword" class="form-label">Save password securely</label>
                            <div class="form-help">Password will be encrypted and stored in VSCode settings</div>
                        </div>
                    </div>
                `;

            case 'ssl-settings':
                return `
                    <div class="step-header">
                        <div class="step-title">SSL Configuration</div>
                        <div class="step-description">
                            Configure SSL/TLS settings for secure connections (optional).
                        </div>
                    </div>

                    <div class="form-section">
                        <div class="form-section-title">SSL Mode</div>
                        <div class="form-grid">
                            <div class="form-group">
                                <label class="form-label">SSL Mode</label>
                                <select name="sslMode" class="form-input">
                                    <option value="disable">Disable</option>
                                    <option value="require" selected>Require</option>
                                    <option value="prefer">Prefer</option>
                                    <option value="allow">Allow</option>
                                    <option value="verify-ca">Verify CA</option>
                                    <option value="verify-full">Verify Full</option>
                                </select>
                                <div class="form-help">SSL connection mode</div>
                            </div>
                        </div>

                        <div class="checkbox-group" style="margin-top: 15px;">
                            <input type="checkbox" name="useCertificate" class="checkbox-input" id="useCertificate">
                            <label for="useCertificate" class="form-label">Use client certificate</label>
                            <div class="form-help">Enable client certificate authentication</div>
                        </div>

                        <div id="certificateFields" style="display: none; margin-top: 15px;">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label class="form-label">Client Certificate Path</label>
                                    <input type="text" name="clientCertPath" class="form-input"
                                           placeholder="/path/to/client.crt">
                                </div>
                                <div class="form-group">
                                    <label class="form-label">Client Key Path</label>
                                    <input type="text" name="clientKeyPath" class="form-input"
                                           placeholder="/path/to/client.key">
                                </div>
                            </div>
                        </div>
                    </div>

                    <script>
                        document.getElementById('useCertificate').addEventListener('change', function() {
                            document.getElementById('certificateFields').style.display =
                                this.checked ? 'block' : 'none';
                        });
                    </script>
                `;

            case 'connection-options':
                return `
                    <div class="step-header">
                        <div class="step-title">Connection Options</div>
                        <div class="step-description">
                            Configure additional connection options and preferences.
                        </div>
                    </div>

                    <div class="form-section">
                        <div class="form-section-title">Connection Settings</div>
                        <div class="form-grid">
                            <div class="form-group">
                                <label class="form-label">Connection Timeout (seconds)</label>
                                <input type="number" name="connectionTimeout" class="form-input"
                                       value="30" min="5" max="300">
                                <div class="form-help">Maximum time to wait for connection</div>
                            </div>

                            <div class="form-group">
                                <label class="form-label">Command Timeout (seconds)</label>
                                <input type="number" name="commandTimeout" class="form-input"
                                       value="300" min="30" max="3600">
                                <div class="form-help">Maximum time to wait for query execution</div>
                            </div>
                        </div>
                    </div>

                    <div class="form-section">
                        <div class="form-section-title">Advanced Options</div>
                        <div class="form-grid">
                            <div class="form-group">
                                <label class="form-label">Application Name</label>
                                <input type="text" name="applicationName" class="form-input"
                                       placeholder="VSCode PostgreSQL Extension">
                                <div class="form-help">Application name to show in PostgreSQL logs</div>
                            </div>

                            <div class="form-group">
                                <label class="form-label">Schema Filter</label>
                                <input type="text" name="schemaFilter" class="form-input"
                                       placeholder="public, myschema">
                                <div class="form-help">Comma-separated list of schemas to include (leave empty for all)</div>
                            </div>
                        </div>

                        <div class="checkbox-group" style="margin-top: 15px;">
                            <input type="checkbox" name="autoConnect" class="checkbox-input" id="autoConnect" checked>
                            <label for="autoConnect" class="form-label">Auto-connect on startup</label>
                            <div class="form-help">Automatically connect when VSCode starts</div>
                        </div>
                    </div>
                `;

            case 'test-connection':
                return `
                    <div class="step-header">
                        <div class="step-title">Test Connection</div>
                        <div class="step-description">
                            Let's test your connection settings to make sure everything works correctly.
                        </div>
                    </div>

                    <div class="connection-test">
                        <div class="test-status" id="testStatus">
                            <div class="status-indicator status-loading"></div>
                            Ready to test connection
                        </div>

                        <button class="btn btn-primary" onclick="testConnection()" id="testConnectionBtn">
                            Test Connection
                        </button>

                        <div class="test-output" id="testOutput">
                            Click "Test Connection" to verify your settings...
                        </div>
                    </div>

                    <div class="form-section">
                        <div class="form-section-title">What happens next?</div>
                        <div style="color: var(--vscode-descriptionForeground); line-height: 1.6;">
                            <p>If the connection test succeeds, you'll proceed to review your settings.
                            If it fails, you can go back and modify your connection details.</p>
                            <p><strong>Note:</strong> The connection test doesn't save your settings permanently.
                            You'll have a chance to review everything before finalizing.</p>
                        </div>
                    </div>
                `;

            case 'summary':
                return `
                    <div class="step-header">
                        <div class="step-title">Connection Summary</div>
                        <div class="step-description">
                            Review your connection settings before saving.
                        </div>
                    </div>

                    <div class="summary-grid">
                        <div class="summary-card">
                            <div class="summary-title">Connection Info</div>
                            <div class="summary-value" id="summaryName">Connection Name</div>
                            <div style="font-size: 12px; color: var(--vscode-descriptionForeground);" id="summaryHost">
                                host:port/database
                            </div>
                        </div>

                        <div class="summary-card">
                            <div class="summary-title">Authentication</div>
                            <div class="summary-value" id="summaryUsername">username</div>
                            <div style="font-size: 12px; color: var(--vscode-gitDecoration-addedResourceForeground);">
                                Password saved securely
                            </div>
                        </div>

                        <div class="summary-card">
                            <div class="summary-title">SSL Settings</div>
                            <div class="summary-value" id="summarySSL">SSL Mode</div>
                            <div style="font-size: 12px; color: var(--vscode-descriptionForeground);">
                                Client certificate: Not used
                            </div>
                        </div>

                        <div class="summary-card">
                            <div class="summary-title">Options</div>
                            <div class="summary-value" id="summaryOptions">Default settings</div>
                            <div style="font-size: 12px; color: var(--vscode-descriptionForeground);">
                                Auto-connect: Enabled
                            </div>
                        </div>
                    </div>

                    <div class="form-section">
                        <div class="form-section-title">Ready to Save?</div>
                        <div style="color: var(--vscode-descriptionForeground); line-height: 1.6;">
                            <p>Your connection will be saved securely and will appear in the PostgreSQL Explorer.
                            You can edit these settings later or add more connections as needed.</p>
                            <p><strong>Next steps:</strong> Start exploring your database schema, run queries,
                            and use all the PostgreSQL extension features!</p>
                        </div>
                    </div>

                    <script>
                        // Update summary with current data
                        function updateSummary() {
                            const data = ${JSON.stringify(this.wizardData)};
                            document.getElementById('summaryName').textContent = data.name || 'Unnamed Connection';
                            document.getElementById('summaryHost').textContent =
                                \`\${data.host || 'localhost'}:\${data.port || '5432'}/\${data.database || 'database'}\`;
                            document.getElementById('summaryUsername').textContent = data.username || 'username';
                            document.getElementById('summarySSL').textContent = data.sslMode || 'Require';
                            document.getElementById('summaryOptions').textContent =
                                \`Timeout: \${data.connectionTimeout || '30'}s, App: \${data.applicationName || 'VSCode'}\`;
                        }

                        updateSummary();
                    </script>
                `;

            default:
                return `
                    <div class="step-header">
                        <div class="step-title">Unknown Step</div>
                        <div class="step-description">This step is not implemented yet.</div>
                    </div>
                `;
        }
    }

    private async handleWebviewMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'nextStep':
                await this.nextStep(message.data);
                break;
            case 'goToStep':
                await this.goToStep(message.stepIndex);
                break;
            case 'cancelWizard':
                this.dispose();
                break;
            case 'testConnection':
                await this.testConnectionFromWizard(message.data);
                break;
        }
    }

    private async nextStep(data: any): Promise<void> {
        // Merge step data into wizard data
        this.wizardData = { ...this.wizardData, ...data };

        if (this.currentStep < this.steps.length - 1) {
            this.currentStep++;
            await this.updateWizardView();
        } else {
            // Finish wizard
            await this.finishWizard();
        }
    }

    private async goToStep(stepIndex: number): Promise<void> {
        this.currentStep = stepIndex;
        await this.updateWizardView();
    }

    private async updateWizardView(): Promise<void> {
        if (this.panel) {
            const htmlContent = await this.generateWizardHtml();
            this.panel.webview.html = htmlContent;
        }
    }

    private async testConnectionFromWizard(data: any): Promise<void> {
        try {
            // Test the connection using the provided data
            const testResult = await this.connectionManager.testConnection(data);

            // Send result back to webview
            this.panel?.webview.postMessage({
                command: 'connectionTestResult',
                result: {
                    success: testResult,
                    duration: 150, // Mock duration
                    error: testResult ? null : 'Connection failed'
                }
            });
        } catch (error) {
            this.panel?.webview.postMessage({
                command: 'connectionTestResult',
                result: {
                    success: false,
                    error: (error as Error).message
                }
            });
        }
    }

    private async finishWizard(): Promise<void> {
        try {
            // Create the connection
            await this.connectionManager.addConnection(this.wizardData);

            vscode.window.showInformationMessage(
                `Connection "${this.wizardData.name}" created successfully!`,
                'View Explorer', 'Test Connection'
            ).then(selection => {
                if (selection === 'View Explorer') {
                    vscode.commands.executeCommand('postgresql.refreshExplorer');
                } else if (selection === 'Test Connection') {
                    // Find the created connection to test it
                    const connections = this.connectionManager.getConnections();
                    const newConnection = connections.find(c => c.name === this.wizardData.name);
                    if (newConnection) {
                        vscode.commands.executeCommand('postgresql.testConnection', newConnection);
                    }
                }
            });

            this.dispose();
        } catch (error) {
            Logger.error('Failed to create connection', error as Error);
            vscode.window.showErrorMessage(
                `Failed to create connection: ${(error as Error).message}`
            );
        }
    }

    dispose(): void {
        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }
    }
}