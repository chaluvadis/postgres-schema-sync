import * as vscode from 'vscode';
import { Logger } from '@/utils/Logger';

export interface OnboardingStep {
    id: string;
    title: string;
    description: string;
    content: {
        type: 'text' | 'video' | 'interactive' | 'checklist';
        data: any;
    };
    action?: {
        type: 'command' | 'link' | 'custom';
        target: string;
        label: string;
    };
    canSkip: boolean;
    estimatedTime: number; // in seconds
}

export class OnboardingView {
    private panel: vscode.WebviewPanel | undefined;
    private currentStep = 0;
    private userProgress: Map<string, boolean> = new Map();
    private onboardingSteps: OnboardingStep[] = [
        {
            id: 'welcome',
            title: 'Welcome to PostgreSQL Extension',
            description: 'Get started with enterprise-grade database management',
            content: {
                type: 'text',
                data: {
                    heading: 'Welcome to PostgreSQL Schema Compare & Sync!',
                    body: 'This extension provides powerful database management capabilities directly in VS Code. Let\'s get you set up and running quickly.',
                    features: [
                        '🔗 Multi-environment connection management',
                        '🌳 Visual database schema explorer',
                        '⚖️ Advanced schema comparison with diff visualization',
                        '🔄 Migration generation and execution',
                        '🛡️ Secure credential storage',
                        '⚡ Enterprise-grade performance monitoring'
                    ]
                }
            },
            canSkip: false,
            estimatedTime: 60
        },
        {
            id: 'create-connection',
            title: 'Create Your First Connection',
            description: 'Set up a database connection to get started',
            content: {
                type: 'interactive',
                data: {
                    instruction: 'Click the button below to create your first database connection using our step-by-step wizard.',
                    actionText: 'Open Connection Wizard',
                    command: 'postgresql.addConnection'
                }
            },
            action: {
                type: 'command',
                target: 'postgresql.addConnection',
                label: 'Create Connection'
            },
            canSkip: false,
            estimatedTime: 120
        },
        {
            id: 'explore-schema',
            title: 'Explore Database Schema',
            description: 'Learn to navigate and understand your database structure',
            content: {
                type: 'text',
                data: {
                    heading: 'Understanding Your Database Schema',
                    body: 'Once connected, you can explore your database schema using the PostgreSQL Explorer in the sidebar.',
                    tips: [
                        '📁 Browse tables, views, functions, and other objects',
                        '🔍 View detailed object information and dependencies',
                        '📊 Check object sizes and metadata',
                        '🔗 Navigate through schema relationships'
                    ]
                }
            },
            canSkip: true,
            estimatedTime: 90
        },
        {
            id: 'compare-schemas',
            title: 'Compare Schemas',
            description: 'Learn how to compare database schemas across environments',
            content: {
                type: 'text',
                data: {
                    heading: 'Schema Comparison Made Easy',
                    body: 'Compare schemas between different databases to identify differences and generate migration scripts.',
                    steps: [
                        '1. Select source and target connections',
                        '2. Run detailed schema comparison',
                        '3. Review differences with visual diff viewer',
                        '4. Generate migration scripts',
                        '5. Preview and execute migrations'
                    ]
                }
            },
            canSkip: true,
            estimatedTime: 150
        },
        {
            id: 'productivity-tips',
            title: 'Productivity Tips',
            description: 'Learn keyboard shortcuts and advanced features',
            content: {
                type: 'checklist',
                data: {
                    title: 'Essential Tips for Maximum Productivity',
                    items: [
                        {
                            text: 'Use Ctrl+Shift+P to open command palette and search for PostgreSQL commands',
                            completed: false
                        },
                        {
                            text: 'Right-click database objects for quick actions and context menus',
                            completed: false
                        },
                        {
                            text: 'Use the dashboard to monitor connection health and performance',
                            completed: false
                        },
                        {
                            text: 'Enable auto-completion for SQL files by opening them in the editor',
                            completed: false
                        },
                        {
                            text: 'Set up keyboard shortcuts for frequently used operations',
                            completed: false
                        },
                        {
                            text: 'Use the performance monitor to identify slow queries',
                            completed: false
                        }
                    ]
                }
            },
            canSkip: true,
            estimatedTime: 180
        },
        {
            id: 'next-steps',
            title: 'What\'s Next?',
            description: 'Explore advanced features and get help when needed',
            content: {
                type: 'text',
                data: {
                    heading: 'You\'re Ready to Go!',
                    body: 'You now have the basics to start using the PostgreSQL extension effectively. Here are some next steps to explore:',
                    suggestions: [
                        '📚 Read the full documentation for advanced features',
                        '🎯 Explore the settings panel to customize the extension',
                        '🔧 Set up multiple connections for different environments',
                        '📊 Use the dashboard to monitor your database health',
                        '🆘 Access help and support when you need it'
                    ],
                    resources: [
                        {
                            title: 'Documentation',
                            description: 'Complete guide with examples and best practices',
                            action: 'View Documentation'
                        },
                        {
                            title: 'Video Tutorials',
                            description: 'Step-by-step video guides for common tasks',
                            action: 'Watch Videos'
                        },
                        {
                            title: 'Community Support',
                            description: 'Get help from the community and contributors',
                            action: 'Join Community'
                        }
                    ]
                }
            },
            canSkip: true,
            estimatedTime: 90
        }
    ];

    constructor() {}

    async showOnboarding(): Promise<void> {
        try {
            Logger.info('Opening onboarding experience');

            this.panel = vscode.window.createWebviewPanel(
                'postgresqlOnboarding',
                'Getting Started - PostgreSQL Extension',
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
            const htmlContent = await this.generateOnboardingHtml();
            this.panel.webview.html = htmlContent;

            // Handle messages from webview
            this.panel.webview.onDidReceiveMessage(async (message) => {
                await this.handleWebviewMessage(message);
            });

        } catch (error) {
            Logger.error('Failed to show onboarding', error as Error);
            vscode.window.showErrorMessage(
                `Failed to open onboarding: ${(error as Error).message}`
            );
        }
    }

    private async generateOnboardingHtml(): Promise<string> {
        const step = this.onboardingSteps[this.currentStep];
        const progress = ((this.currentStep + 1) / this.onboardingSteps.length) * 100;

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Getting Started - PostgreSQL Extension</title>
                <style>
                    :root {
                        --postgresql-primary: #336791;
                        --postgresql-primary-light: #4a8bc2;
                        --postgresql-success: #4bb74a;
                        --postgresql-accent: #4da6ff;

                        --vscode-bg-primary: #1e1e1e;
                        --vscode-bg-secondary: #2d2d2d;
                        --vscode-bg-tertiary: #3c3c3c;
                        --vscode-fg-primary: #cccccc;
                        --vscode-fg-secondary: #969696;
                        --vscode-border-primary: #3c3c3c;
                        --vscode-border-focus: #007acc;
                        --vscode-button-bg: #0e639c;
                        --vscode-button-fg: #ffffff;
                        --vscode-button-hover-bg: #1177bb;

                        --font-family-primary: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        --font-size-sm: 11px;
                        --font-size-base: 13px;
                        --font-size-lg: 14px;
                        --font-size-xl: 16px;
                        --font-size-2xl: 18px;
                        --font-size-3xl: 20px;
                        --font-size-4xl: 24px;
                        --space-1: 4px;
                        --space-2: 8px;
                        --space-3: 12px;
                        --space-4: 16px;
                        --space-5: 20px;
                        --space-6: 24px;
                        --space-8: 32px;
                        --radius-base: 4px;
                        --radius-md: 6px;
                        --radius-lg: 8px;
                        --transition-base: 250ms ease-in-out;
                    }

                    body {
                        font-family: var(--font-family-primary);
                        padding: 0;
                        margin: 0;
                        background: var(--vscode-bg-primary);
                        color: var(--vscode-fg-primary);
                        height: 100vh;
                        display: flex;
                        flex-direction: column;
                    }

                    .onboarding-header {
                        background: linear-gradient(135deg, var(--postgresql-primary) 0%, var(--postgresql-primary-light) 100%);
                        color: white;
                        padding: var(--space-6) var(--space-8);
                        text-align: center;
                    }

                    .header-icon {
                        font-size: 48px;
                        margin-bottom: var(--space-4);
                    }

                    .header-title {
                        font-size: var(--font-size-3xl);
                        font-weight: bold;
                        margin-bottom: var(--space-2);
                    }

                    .header-description {
                        font-size: var(--font-size-lg);
                        opacity: 0.9;
                        margin-bottom: var(--space-4);
                    }

                    .progress-container {
                        background: var(--vscode-bg-secondary);
                        padding: var(--space-4) var(--space-8);
                        border-bottom: 1px solid var(--vscode-border-primary);
                    }

                    .progress-info {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: var(--space-3);
                    }

                    .step-counter {
                        font-size: var(--font-size-sm);
                        color: var(--vscode-fg-secondary);
                    }

                    .time-estimate {
                        font-size: var(--font-size-sm);
                        color: var(--postgresql-accent);
                    }

                    .progress-bar {
                        width: 100%;
                        height: 6px;
                        background: var(--vscode-bg-tertiary);
                        border-radius: 3px;
                        overflow: hidden;
                    }

                    .progress-fill {
                        height: 100%;
                        background: var(--postgresql-primary);
                        border-radius: 3px;
                        transition: width var(--transition-base);
                        width: ${progress}%;
                    }

                    .onboarding-content {
                        flex: 1;
                        padding: var(--space-8);
                        overflow-y: auto;
                    }

                    .step-content {
                        max-width: 800px;
                        margin: 0 auto;
                    }

                    .step-header {
                        text-align: center;
                        margin-bottom: var(--space-8);
                    }

                    .step-title {
                        font-size: var(--font-size-3xl);
                        font-weight: bold;
                        margin-bottom: var(--space-3);
                        color: var(--postgresql-primary);
                    }

                    .step-description {
                        font-size: var(--font-size-lg);
                        color: var(--vscode-fg-secondary);
                        line-height: 1.6;
                    }

                    .content-section {
                        background: var(--vscode-bg-secondary);
                        border: 1px solid var(--vscode-border-primary);
                        border-radius: var(--radius-lg);
                        padding: var(--space-6);
                        margin-bottom: var(--space-6);
                    }

                    .section-title {
                        font-size: var(--font-size-xl);
                        font-weight: bold;
                        margin-bottom: var(--space-4);
                        color: var(--postgresql-accent);
                    }

                    .features-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                        gap: var(--space-4);
                        margin-bottom: var(--space-6);
                    }

                    .feature-card {
                        background: var(--vscode-bg-tertiary);
                        border: 1px solid var(--vscode-border-primary);
                        border-radius: var(--radius-md);
                        padding: var(--space-4);
                        text-align: center;
                        transition: transform var(--transition-base);
                    }

                    .feature-card:hover {
                        transform: translateY(-2px);
                        border-color: var(--postgresql-primary);
                    }

                    .feature-icon {
                        font-size: 24px;
                        margin-bottom: var(--space-2);
                    }

                    .feature-title {
                        font-size: var(--font-size-base);
                        font-weight: bold;
                        margin-bottom: var(--space-2);
                    }

                    .feature-description {
                        font-size: var(--font-size-sm);
                        color: var(--vscode-fg-secondary);
                        line-height: 1.5;
                    }

                    .tips-list {
                        list-style: none;
                        padding: 0;
                        margin: 0;
                    }

                    .tip-item {
                        display: flex;
                        align-items: flex-start;
                        gap: var(--space-3);
                        padding: var(--space-3) 0;
                        border-bottom: 1px solid var(--vscode-border-primary);
                    }

                    .tip-item:last-child {
                        border-bottom: none;
                    }

                    .tip-icon {
                        font-size: 16px;
                        flex-shrink: 0;
                    }

                    .tip-content {
                        flex: 1;
                    }

                    .tip-title {
                        font-size: var(--font-size-base);
                        font-weight: bold;
                        margin-bottom: var(--space-1);
                    }

                    .tip-description {
                        font-size: var(--font-size-sm);
                        color: var(--vscode-fg-secondary);
                        line-height: 1.5;
                    }

                    .checklist {
                        background: var(--vscode-bg-secondary);
                        border: 1px solid var(--vscode-border-primary);
                        border-radius: var(--radius-md);
                        overflow: hidden;
                    }

                    .checklist-header {
                        background: var(--vscode-bg-tertiary);
                        padding: var(--space-4);
                        border-bottom: 1px solid var(--vscode-border-primary);
                    }

                    .checklist-title {
                        font-size: var(--font-size-lg);
                        font-weight: bold;
                        margin-bottom: var(--space-1);
                    }

                    .checklist-description {
                        font-size: var(--font-size-sm);
                        color: var(--vscode-fg-secondary);
                    }

                    .checklist-items {
                        padding: 0;
                        margin: 0;
                        list-style: none;
                    }

                    .checklist-item {
                        display: flex;
                        align-items: center;
                        gap: var(--space-3);
                        padding: var(--space-4);
                        border-bottom: 1px solid var(--vscode-border-primary);
                        cursor: pointer;
                        transition: background-color var(--transition-base);
                    }

                    .checklist-item:hover {
                        background: var(--vscode-bg-tertiary);
                    }

                    .checklist-item:last-child {
                        border-bottom: none;
                    }

                    .checkbox-custom {
                        width: 18px;
                        height: 18px;
                        border: 2px solid var(--vscode-border-primary);
                        border-radius: 3px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background: var(--vscode-bg-secondary);
                        transition: all var(--transition-base);
                    }

                    .checkbox-custom.checked {
                        background: var(--postgresql-success);
                        border-color: var(--postgresql-success);
                    }

                    .checkbox-custom.checked::after {
                        content: '✓';
                        color: white;
                        font-size: 12px;
                        font-weight: bold;
                    }

                    .checklist-item-content {
                        flex: 1;
                    }

                    .item-title {
                        font-size: var(--font-size-base);
                        font-weight: bold;
                        margin-bottom: var(--space-1);
                    }

                    .item-description {
                        font-size: var(--font-size-sm);
                        color: var(--vscode-fg-secondary);
                        line-height: 1.4;
                    }

                    .interactive-section {
                        text-align: center;
                        padding: var(--space-8) var(--space-4);
                    }

                    .interactive-prompt {
                        font-size: var(--font-size-lg);
                        margin-bottom: var(--space-4);
                        color: var(--vscode-fg-primary);
                    }

                    .action-button {
                        background: var(--vscode-button-bg);
                        color: var(--vscode-button-fg);
                        border: none;
                        padding: var(--space-4) var(--space-8);
                        border-radius: var(--radius-lg);
                        font-size: var(--font-size-lg);
                        font-weight: bold;
                        cursor: pointer;
                        transition: all var(--transition-base);
                        box-shadow: 0 4px 12px rgba(14, 99, 156, 0.3);
                    }

                    .action-button:hover {
                        background: var(--vscode-button-hover-bg);
                        transform: translateY(-2px);
                        box-shadow: 0 6px 16px rgba(14, 99, 156, 0.4);
                    }

                    .steps-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                        gap: var(--space-4);
                        margin-top: var(--space-6);
                    }

                    .step-card {
                        background: var(--vscode-bg-tertiary);
                        border: 1px solid var(--vscode-border-primary);
                        border-radius: var(--radius-md);
                        padding: var(--space-4);
                        text-align: center;
                    }

                    .step-number {
                        width: 32px;
                        height: 32px;
                        background: var(--postgresql-primary);
                        color: white;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-weight: bold;
                        margin: 0 auto var(--space-3);
                    }

                    .step-title {
                        font-size: var(--font-size-base);
                        font-weight: bold;
                        margin-bottom: var(--space-2);
                    }

                    .step-description {
                        font-size: var(--font-size-sm);
                        color: var(--vscode-fg-secondary);
                    }

                    .resources-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                        gap: var(--space-4);
                        margin-top: var(--space-6);
                    }

                    .resource-card {
                        background: var(--vscode-bg-tertiary);
                        border: 1px solid var(--vscode-border-primary);
                        border-radius: var(--radius-md);
                        padding: var(--space-5);
                        transition: all var(--transition-base);
                    }

                    .resource-card:hover {
                        border-color: var(--postgresql-primary);
                        transform: translateY(-2px);
                    }

                    .resource-title {
                        font-size: var(--font-size-lg);
                        font-weight: bold;
                        margin-bottom: var(--space-2);
                        color: var(--postgresql-accent);
                    }

                    .resource-description {
                        font-size: var(--font-size-sm);
                        color: var(--vscode-fg-secondary);
                        margin-bottom: var(--space-4);
                        line-height: 1.5;
                    }

                    .resource-action {
                        background: var(--vscode-button-bg);
                        color: var(--vscode-button-fg);
                        border: none;
                        padding: var(--space-2) var(--space-4);
                        border-radius: var(--radius-base);
                        font-size: var(--font-size-sm);
                        font-weight: bold;
                        cursor: pointer;
                        transition: background-color var(--transition-base);
                    }

                    .resource-action:hover {
                        background: var(--vscode-button-hover-bg);
                    }

                    .onboarding-footer {
                        background: var(--vscode-bg-secondary);
                        border-top: 1px solid var(--vscode-border-primary);
                        padding: var(--space-5) var(--space-8);
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }

                    .btn {
                        padding: var(--space-3) var(--space-6);
                        border: none;
                        border-radius: var(--radius-base);
                        font-size: var(--font-size-sm);
                        font-weight: bold;
                        cursor: pointer;
                        transition: all var(--transition-base);
                    }

                    .btn-primary {
                        background: var(--vscode-button-bg);
                        color: var(--vscode-button-fg);
                    }

                    .btn-primary:hover:not(:disabled) {
                        background: var(--vscode-button-hover-bg);
                    }

                    .btn-secondary {
                        background: var(--vscode-bg-tertiary);
                        color: var(--vscode-fg-primary);
                        border: 1px solid var(--vscode-border-primary);
                    }

                    .btn-secondary:hover:not(:disabled) {
                        background: var(--vscode-bg-secondary);
                    }

                    .btn:disabled {
                        opacity: 0.5;
                        cursor: not-allowed;
                    }

                    .btn-group {
                        display: flex;
                        gap: var(--space-3);
                    }

                    .completion-message {
                        text-align: center;
                        padding: var(--space-8);
                    }

                    .completion-icon {
                        font-size: 64px;
                        margin-bottom: var(--space-4);
                    }

                    .completion-title {
                        font-size: var(--font-size-3xl);
                        font-weight: bold;
                        margin-bottom: var(--space-3);
                        color: var(--postgresql-success);
                    }

                    .completion-description {
                        font-size: var(--font-size-lg);
                        color: var(--vscode-fg-secondary);
                        margin-bottom: var(--space-6);
                    }

                    @media (max-width: 768px) {
                        .onboarding-header,
                        .progress-container,
                        .onboarding-content,
                        .onboarding-footer {
                            padding-left: var(--space-4);
                            padding-right: var(--space-4);
                        }

                        .features-grid,
                        .steps-grid,
                        .resources-grid {
                            grid-template-columns: 1fr;
                        }

                        .onboarding-footer {
                            flex-direction: column;
                            gap: var(--space-4);
                        }
                    }
                </style>
            </head>
            <body>
                <div class="onboarding-header">
                    <div class="header-icon">🚀</div>
                    <div class="header-title">Getting Started</div>
                    <div class="header-description">Your journey to mastering PostgreSQL Extension starts here</div>
                </div>

                <div class="progress-container">
                    <div class="progress-info">
                        <div class="step-counter">Step ${this.currentStep + 1} of ${this.onboardingSteps.length}</div>
                        <div class="time-estimate">⏱️ ~${Math.ceil((this.getRemainingTime() / 60))} minutes remaining</div>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill"></div>
                    </div>
                </div>

                <div class="onboarding-content">
                    <div class="step-content">
                        ${this.generateStepContent(step)}
                    </div>
                </div>

                <div class="onboarding-footer">
                    <div class="btn-group">
                        <button class="btn btn-secondary" onclick="goToPreviousStep()" ${this.currentStep === 0 ? 'disabled' : ''}>
                            ← Previous
                        </button>
                        ${step.canSkip ? `
                            <button class="btn btn-secondary" onclick="skipStep()">Skip</button>
                        ` : ''}
                    </div>

                    <div class="btn-group">
                        ${this.currentStep === this.onboardingSteps.length - 1 ? `
                            <button class="btn btn-primary" onclick="completeOnboarding()">Get Started! 🎉</button>
                        ` : `
                            <button class="btn btn-primary" onclick="goToNextStep()">Next →</button>
                        `}
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    let currentStep = ${this.currentStep};

                    function goToNextStep() {
                        if (currentStep < ${this.onboardingSteps.length - 1}) {
                            vscode.postMessage({
                                command: 'nextStep'
                            });
                        }
                    }

                    function goToPreviousStep() {
                        if (currentStep > 0) {
                            vscode.postMessage({
                                command: 'previousStep'
                            });
                        }
                    }

                    function skipStep() {
                        vscode.postMessage({
                            command: 'skipStep'
                        });
                    }

                    function completeOnboarding() {
                        vscode.postMessage({
                            command: 'completeOnboarding'
                        });
                    }

                    function executeAction(actionType, actionTarget) {
                        vscode.postMessage({
                            command: 'executeAction',
                            actionType: actionType,
                            actionTarget: actionTarget
                        });
                    }

                    function toggleChecklistItem(itemId) {
                        vscode.postMessage({
                            command: 'toggleChecklistItem',
                            itemId: itemId
                        });
                    }

                    // Listen for messages from extension
                    window.addEventListener('message', event => {
                        const message = event.data;

                        switch (message.command) {
                            case 'stepCompleted':
                                // Update UI to reflect completion
                                break;

                            case 'updateProgress':
                                // Update progress indicators
                                break;
                        }
                    });

                    // Auto-advance for certain steps after user interaction
                    ${step.action ? `
                        // Auto-advance after action is taken
                        setTimeout(() => {
                            if (document.querySelector('.action-button')) {
                                const actionBtn = document.querySelector('.action-button');
                                actionBtn.addEventListener('click', () => {
                                    setTimeout(() => {
                                        goToNextStep();
                                    }, 2000); // Give user time to see the result
                                });
                            }
                        }, 1000);
                    ` : ''}
                </script>
            </body>
            </html>
        `;
    }

    private generateStepContent(step: OnboardingStep): string {
        switch (step.content.type) {
            case 'text':
                return this.generateTextContent(step);
            case 'interactive':
                return this.generateInteractiveContent(step);
            case 'checklist':
                return this.generateChecklistContent(step);
            default:
                return '<div>Content type not supported</div>';
        }
    }

    private generateTextContent(step: OnboardingStep): string {
        const data = step.content.data;

        return `
            <div class="step-header">
                <div class="step-title">${data.heading}</div>
                <div class="step-description">${data.body}</div>
            </div>

            ${data.features ? `
                <div class="content-section">
                    <div class="section-title">✨ Key Features</div>
                    <div class="features-grid">
                        ${data.features.map((feature: string) => `
                            <div class="feature-card">
                                <div class="feature-title">${feature}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}

            ${data.tips ? `
                <div class="content-section">
                    <div class="section-title">💡 Pro Tips</div>
                    <ul class="tips-list">
                        ${data.tips.map((tip: string) => `
                            <li class="tip-item">
                                <span class="tip-icon">💡</span>
                                <div class="tip-content">
                                    <div class="tip-title">${tip}</div>
                                </div>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            ` : ''}

            ${data.steps ? `
                <div class="content-section">
                    <div class="section-title">📋 How It Works</div>
                    <div class="steps-grid">
                        ${data.steps.map((stepText: string, index: number) => `
                            <div class="step-card">
                                <div class="step-number">${index + 1}</div>
                                <div class="step-title">${stepText}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}

            ${data.suggestions ? `
                <div class="content-section">
                    <div class="section-title">🚀 Next Steps</div>
                    <ul class="tips-list">
                        ${data.suggestions.map((suggestion: string) => `
                            <li class="tip-item">
                                <span class="tip-icon">🚀</span>
                                <div class="tip-content">
                                    <div class="tip-title">${suggestion}</div>
                                </div>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            ` : ''}

            ${data.resources ? `
                <div class="content-section">
                    <div class="section-title">📚 Resources</div>
                    <div class="resources-grid">
                        ${data.resources.map((resource: any) => `
                            <div class="resource-card">
                                <div class="resource-title">${resource.title}</div>
                                <div class="resource-description">${resource.description}</div>
                                <button class="resource-action" onclick="executeAction('link', '${resource.action}')">
                                    ${resource.action}
                                </button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        `;
    }

    private generateInteractiveContent(step: OnboardingStep): string {
        const data = step.content.data;

        return `
            <div class="step-header">
                <div class="step-title">${step.title}</div>
                <div class="step-description">${step.description}</div>
            </div>

            <div class="content-section">
                <div class="interactive-section">
                    <div class="interactive-prompt">${data.instruction}</div>
                    <button class="action-button" onclick="executeAction('${data.command ? 'command' : 'custom'}', '${data.command || data.actionText}')">
                        ${data.actionText}
                    </button>
                </div>
            </div>
        `;
    }

    private generateChecklistContent(step: OnboardingStep): string {
        const data = step.content.data;

        return `
            <div class="step-header">
                <div class="step-title">${data.title}</div>
                <div class="step-description">Complete these tasks to master the extension</div>
            </div>

            <div class="content-section">
                <div class="checklist">
                    <div class="checklist-header">
                        <div class="checklist-title">📋 Productivity Checklist</div>
                        <div class="checklist-description">Track your progress as you learn each feature</div>
                    </div>
                    <ul class="checklist-items">
                        ${data.items.map((item: any, index: number) => `
                            <li class="checklist-item" onclick="toggleChecklistItem('item-${index}')">
                                <div class="checkbox-custom ${item.completed ? 'checked' : ''}"></div>
                                <div class="checklist-item-content">
                                    <div class="item-title">${item.text}</div>
                                    <div class="item-description">${item.description || ''}</div>
                                </div>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            </div>
        `;
    }

    private getRemainingTime(): number {
        return this.onboardingSteps
            .slice(this.currentStep)
            .reduce((total, step) => total + step.estimatedTime, 0);
    }

    private async handleWebviewMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'nextStep':
                await this.nextStep();
                break;
            case 'previousStep':
                await this.previousStep();
                break;
            case 'skipStep':
                await this.skipStep();
                break;
            case 'completeOnboarding':
                await this.completeOnboarding();
                break;
            case 'executeAction':
                await this.executeAction(message.actionType, message.actionTarget);
                break;
            case 'toggleChecklistItem':
                this.toggleChecklistItem(message.itemId);
                break;
        }
    }

    private async nextStep(): Promise<void> {
        if (this.currentStep < this.onboardingSteps.length - 1) {
            this.currentStep++;
            await this.updateOnboardingView();
        }
    }

    private async previousStep(): Promise<void> {
        if (this.currentStep > 0) {
            this.currentStep--;
            await this.updateOnboardingView();
        }
    }

    private async skipStep(): Promise<void> {
        await this.nextStep();
    }

    private async completeOnboarding(): Promise<void> {
        // Mark onboarding as completed
        const config = vscode.workspace.getConfiguration('postgresql');
        await config.update('onboardingCompleted', true, vscode.ConfigurationTarget.Global);

        // Show completion message
        vscode.window.showInformationMessage(
            '🎉 Welcome to PostgreSQL Extension! You\'re all set to start managing your databases.',
            'Open Dashboard', 'Create Connection', 'View Documentation'
        ).then(selection => {
            switch (selection) {
                case 'Open Dashboard':
                    vscode.commands.executeCommand('postgresql.showDashboard');
                    break;
                case 'Create Connection':
                    vscode.commands.executeCommand('postgresql.addConnection');
                    break;
                case 'View Documentation':
                    vscode.commands.executeCommand('postgresql.showHelp');
                    break;
            }
        });

        this.dispose();
    }

    private async executeAction(actionType: string, actionTarget: string): Promise<void> {
        switch (actionType) {
            case 'command':
                await vscode.commands.executeCommand(actionTarget);
                break;
            case 'link':
                // Handle link actions (documentation, videos, etc.)
                vscode.env.openExternal(vscode.Uri.parse(actionTarget));
                break;
            case 'custom':
                // Handle custom actions
                break;
        }
    }

    private toggleChecklistItem(itemId: string): Promise<void> {
        // Update checklist item state
        return Promise.resolve();
    }

    private async updateOnboardingView(): Promise<void> {
        if (this.panel) {
            const htmlContent = await this.generateOnboardingHtml();
            this.panel.webview.html = htmlContent;
        }
    }

    dispose(): void {
        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }
    }
}