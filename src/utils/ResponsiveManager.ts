import * as vscode from 'vscode';
import { Logger } from '@/utils/Logger';

export interface ResponsiveBreakpoint {
    name: string;
    minWidth: number;
    maxWidth?: number;
    columns: number;
    spacing: number;
    fontSize: 'small' | 'medium' | 'large';
}

export interface ResponsiveConfig {
    breakpoints: ResponsiveBreakpoint[];
    containerMaxWidth: number;
    enableAutoResize: boolean;
    enableMobileOptimizations: boolean;
}

export class ResponsiveManager {
    private static instance: ResponsiveManager;
    private config: ResponsiveConfig;
    private currentBreakpoint: ResponsiveBreakpoint;
    private resizeObserver: ResizeObserver | null = null;
    private mutationObserver: MutationObserver | null = null;
    private resizeHandlers: Map<string, () => void> = new Map();

    private constructor() {
        this.config = this.loadDefaultConfig();
        this.currentBreakpoint = this.config.breakpoints[0];
        this.initializeResponsiveSystem();
    }

    static getInstance(): ResponsiveManager {
        if (!ResponsiveManager.instance) {
            ResponsiveManager.instance = new ResponsiveManager();
        }
        return ResponsiveManager.instance;
    }

    private loadDefaultConfig(): ResponsiveConfig {
        return {
            breakpoints: [
                { name: 'mobile', minWidth: 0, maxWidth: 640, columns: 1, spacing: 8, fontSize: 'small' },
                { name: 'tablet', minWidth: 641, maxWidth: 1024, columns: 2, spacing: 12, fontSize: 'medium' },
                { name: 'desktop', minWidth: 1025, maxWidth: 1440, columns: 3, spacing: 16, fontSize: 'medium' },
                { name: 'wide', minWidth: 1441, columns: 4, spacing: 20, fontSize: 'large' }
            ],
            containerMaxWidth: 1200,
            enableAutoResize: true,
            enableMobileOptimizations: true
        };
    }

    private initializeResponsiveSystem(): void {
        this.setupResizeObserver();
        this.setupMutationObserver();
        this.handleInitialResize();
        this.applyCurrentBreakpoint();
    }

    private setupResizeObserver(): void {
        if (typeof ResizeObserver === 'undefined') {
            Logger.warn('ResizeObserver not supported, using fallback');
            this.setupResizeFallback();
            return;
        }

        this.resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                this.handleResize(entry.contentRect.width);
            }
        });

        // Observe the main container (VSCode webview)
        const mainContainer = document.querySelector('.main-container') || document.body;
        this.resizeObserver.observe(mainContainer);
    }

    private setupResizeFallback(): void {
        // Fallback for browsers without ResizeObserver
        let resizeTimeout: NodeJS.Timeout;

        const handleResize = () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.handleResize(window.innerWidth);
            }, 150);
        };

        window.addEventListener('resize', handleResize);
        (window as any)._responsiveResizeHandler = handleResize;
    }

    private setupMutationObserver(): void {
        if (typeof MutationObserver === 'undefined') return;

        this.mutationObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    // Re-apply responsive styles when new content is added
                    setTimeout(() => {
                        this.applyCurrentBreakpoint();
                    }, 100);
                }
            });
        });

        this.mutationObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    private handleResize(width: number): void {
        const previousBreakpoint = this.currentBreakpoint;
        this.currentBreakpoint = this.getBreakpointForWidth(width);

        if (previousBreakpoint.name !== this.currentBreakpoint.name) {
            Logger.debug('Breakpoint changed', 'handleResize', {
                from: previousBreakpoint.name,
                to: this.currentBreakpoint.name,
                width
            });

            this.applyCurrentBreakpoint();

            // Notify all registered handlers
            this.resizeHandlers.forEach((handler) => {
                try {
                    handler();
                } catch (error) {
                    Logger.error('Error in resize handler', error as Error);
                }
            });
        }
    }

    private handleInitialResize(): void {
        // Handle initial size
        const width = window.innerWidth;
        this.currentBreakpoint = this.getBreakpointForWidth(width);
        Logger.info('Initial responsive setup', 'handleInitialResize', {
            breakpoint: this.currentBreakpoint.name,
            width
        });
    }


    private applyCurrentBreakpoint(): void {
        const root = document.documentElement;
        const breakpoint = this.currentBreakpoint;

        // Apply breakpoint-specific CSS custom properties
        root.style.setProperty('--current-columns', breakpoint.columns.toString());
        root.style.setProperty('--current-spacing', `${breakpoint.spacing}px`);
        root.style.setProperty('--current-font-size', breakpoint.fontSize);

        // Apply breakpoint classes
        this.config.breakpoints.forEach((bp) => {
            root.classList.remove(`breakpoint-${bp.name}`);
        });
        root.classList.add(`breakpoint-${breakpoint.name}`);

        // Apply mobile optimizations if enabled
        if (this.config.enableMobileOptimizations && breakpoint.name === 'mobile') {
            root.classList.add('mobile-optimized');
        } else {
            root.classList.remove('mobile-optimized');
        }

        // Update container max-width
        const container = document.querySelector('.responsive-container') as HTMLElement;
        if (container) {
            container.style.maxWidth = `${Math.min(this.config.containerMaxWidth, window.innerWidth - 32)}px`;
        }
    }

    // Public API Methods
    getCurrentBreakpoint(): ResponsiveBreakpoint {
        return { ...this.currentBreakpoint };
    }

    getBreakpointForWidth(width: number): ResponsiveBreakpoint {
        for (const breakpoint of this.config.breakpoints) {
            if (width >= breakpoint.minWidth &&
                (!breakpoint.maxWidth || width <= breakpoint.maxWidth)) {
                return breakpoint;
            }
        }
        return this.config.breakpoints[this.config.breakpoints.length - 1];
    }

    addResizeHandler(id: string, handler: () => void): void {
        this.resizeHandlers.set(id, handler);
    }

    removeResizeHandler(id: string): void {
        this.resizeHandlers.delete(id);
    }


    getResponsiveValue<T>(values: { mobile?: T; tablet?: T; desktop?: T; wide?: T }): T | undefined {
        const breakpoint = this.currentBreakpoint;

        switch (breakpoint.name) {
            case 'mobile':
                return values.mobile ?? values.tablet ?? values.desktop ?? values.wide;
            case 'tablet':
                return values.tablet ?? values.desktop ?? values.mobile ?? values.wide;
            case 'desktop':
                return values.desktop ?? values.tablet ?? values.wide ?? values.mobile;
            case 'wide':
                return values.wide ?? values.desktop ?? values.tablet ?? values.mobile;
            default:
                return values.desktop;
        }
    }


    dispose(): void {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }

        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.mutationObserver = null;
        }

        // Remove fallback resize handler
        if ((window as any)._responsiveResizeHandler) {
            window.removeEventListener('resize', (window as any)._responsiveResizeHandler);
            delete (window as any)._responsiveResizeHandler;
        }

        this.resizeHandlers.clear();
    }
}

// Responsive CSS Utilities
export const responsiveCSS = `
/* Responsive Grid System */
.responsive-grid {
    display: grid;
    width: 100%;
}

.grid-item {
    min-width: 0; /* Prevent overflow */
}

/* Mobile First Approach */
.mobile-cols-1 { grid-template-columns: 1fr; }
.mobile-cols-2 { grid-template-columns: repeat(2, 1fr); }
.mobile-cols-3 { grid-template-columns: repeat(3, 1fr); }
.mobile-cols-4 { grid-template-columns: repeat(4, 1fr); }

.tablet-cols-1 { grid-template-columns: 1fr; }
.tablet-cols-2 { grid-template-columns: repeat(2, 1fr); }
.tablet-cols-3 { grid-template-columns: repeat(3, 1fr); }
.tablet-cols-4 { grid-template-columns: repeat(4, 1fr); }

.desktop-cols-1 { grid-template-columns: 1fr; }
.desktop-cols-2 { grid-template-columns: repeat(2, 1fr); }
.desktop-cols-3 { grid-template-columns: repeat(3, 1fr); }
.desktop-cols-4 { grid-template-columns: repeat(4, 1fr); }

.wide-cols-1 { grid-template-columns: 1fr; }
.wide-cols-2 { grid-template-columns: repeat(2, 1fr); }
.wide-cols-3 { grid-template-columns: repeat(3, 1fr); }
.wide-cols-4 { grid-template-columns: repeat(4, 1fr); }

/* Responsive Container */
.responsive-container {
    width: 100%;
    margin: 0 auto;
    padding: 0 var(--space-4);
    box-sizing: border-box;
}

/* Mobile Optimizations */
.mobile-optimized .btn {
    min-height: 44px; /* Touch target size */
    padding: var(--space-3) var(--space-4);
}

.mobile-optimized .input {
    min-height: 44px;
    font-size: 16px; /* Prevent zoom on iOS */
}

.mobile-optimized .form-grid {
    grid-template-columns: 1fr;
}

.mobile-optimized .card {
    margin-bottom: var(--space-4);
}

.mobile-optimized .header {
    padding: var(--space-4);
}

.mobile-optimized .content-area {
    padding: var(--space-4);
}

/* Responsive Typography */
.font-size-small {
    font-size: 12px;
}

.font-size-medium {
    font-size: 14px;
}

.font-size-large {
    font-size: 16px;
}

/* Responsive Spacing */
.mobile-optimized {
    --space-1: 2px;
    --space-2: 4px;
    --space-3: 6px;
    --space-4: 8px;
    --space-5: 10px;
    --space-6: 12px;
    --space-8: 16px;
}

/* Responsive Tables */
@media (max-width: 640px) {
    .responsive-table {
        font-size: var(--font-size-sm);
    }

    .responsive-table th,
    .responsive-table td {
        padding: var(--space-2) var(--space-3);
    }

    .responsive-table th {
        position: static;
    }
}

/* Responsive Cards */
@media (max-width: 640px) {
    .dashboard-grid {
        grid-template-columns: 1fr;
        gap: var(--space-3);
    }

    .metric-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: var(--space-2);
    }

    .summary-cards {
        grid-template-columns: repeat(2, 1fr);
    }
}

@media (min-width: 641px) and (max-width: 1024px) {
    .dashboard-grid {
        grid-template-columns: repeat(2, 1fr);
    }

    .metric-grid {
        grid-template-columns: repeat(3, 1fr);
    }
}

@media (min-width: 1025px) {
    .dashboard-grid {
        grid-template-columns: repeat(3, 1fr);
    }

    .metric-grid {
        grid-template-columns: repeat(4, 1fr);
    }
}

/* Responsive Navigation */
@media (max-width: 640px) {
    .header {
        flex-direction: column;
        gap: var(--space-3);
        text-align: center;
    }

    .view-mode-selector {
        justify-content: center;
        flex-wrap: wrap;
    }

    .footer {
        flex-direction: column;
        gap: var(--space-4);
        text-align: center;
    }

    .action-buttons {
        justify-content: center;
        flex-wrap: wrap;
    }
}

/* Responsive Forms */
@media (max-width: 640px) {
    .form-section {
        padding: var(--space-4);
    }

    .form-grid {
        grid-template-columns: 1fr;
        gap: var(--space-3);
    }

    .checkbox-group {
        align-items: flex-start;
        gap: var(--space-2);
    }
}

/* Responsive Modals */
@media (max-width: 640px) {
    .modal-overlay {
        padding: var(--space-2);
    }

    .modal {
        max-width: 100vw;
        max-height: 100vh;
        border-radius: 0;
    }

    .modal-header,
    .modal-content {
        padding: var(--space-4);
    }
}

/* Responsive Lists */
@media (max-width: 640px) {
    .activity-list,
    .schema-changes,
    .dependency-list {
        max-height: 150px;
    }

    .activity-item,
    .change-item,
    .dependency-item {
        padding: var(--space-2) 0;
        font-size: var(--font-size-xs);
    }
}

/* Responsive Buttons */
@media (max-width: 640px) {
    .btn-group {
        flex-direction: column;
        width: 100%;
    }

    .btn-group .btn {
        width: 100%;
    }
}

/* Responsive Images and Media */
@media (max-width: 640px) {
    .feature-icon,
    .header-icon,
    .success-icon {
        font-size: 36px;
    }

    .completion-icon {
        font-size: 48px;
    }
}

/* Responsive Progress Indicators */
@media (max-width: 640px) {
    .progress-info {
        flex-direction: column;
        gap: var(--space-1);
        text-align: center;
    }

    .progress-bar {
        margin: var(--space-2) 0;
    }
}

/* Responsive Status and Notifications */
@media (max-width: 640px) {
    .status-indicator {
        padding: var(--space-1) var(--space-2);
        font-size: var(--font-size-xs);
    }

    .badge {
        padding: var(--space-1) var(--space-2);
        font-size: var(--font-size-xs);
    }
}

/* Responsive Tooltips */
@media (max-width: 640px) {
    .tooltip::after {
        font-size: var(--font-size-xs);
        padding: var(--space-1) var(--space-2);
        max-width: 200px;
        white-space: normal;
    }
}

/* Responsive Focus Management */
@media (max-width: 640px) {
    .focus-visible:focus-visible {
        outline-offset: 3px;
    }

    .btn:focus-visible,
    .input:focus-visible {
        outline-offset: 2px;
    }
}

/* Responsive Print Styles */
@media print {
    .responsive-grid {
        display: block;
    }

    .grid-item {
        margin-bottom: var(--space-4);
        page-break-inside: avoid;
    }

    .mobile-optimized {
        font-size: 12px;
    }

    .btn {
        border: 1px solid #000;
        background: #fff !important;
        color: #000 !important;
    }
}

/* Responsive Animation Control */
@media (prefers-reduced-motion: reduce) {
    .responsive-grid,
    .grid-item {
        transition: none !important;
        animation: none !important;
    }
}

/* High DPI Display Support */
@media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi) {
    .responsive-grid {
        image-rendering: -webkit-optimize-contrast;
        image-rendering: crisp-edges;
    }
}

/* Touch Device Optimizations */
@media (hover: none) and (pointer: coarse) {
    .btn,
    .card-action,
    .filter-btn,
    .view-mode-btn {
        min-height: 44px;
        min-width: 44px;
        padding: var(--space-3);
    }

    .checkbox-input,
    .radio-input {
        transform: scale(1.2);
        margin: var(--space-2);
    }
}

/* Landscape Mobile Orientation */
@media (max-width: 640px) and (orientation: landscape) {
    .mobile-optimized .header {
        padding: var(--space-2) var(--space-4);
    }

    .mobile-optimized .content-area {
        padding: var(--space-2) var(--space-4);
    }

    .mobile-optimized .modal-header,
    .mobile-optimized .modal-content {
        padding: var(--space-3);
    }
}

/* Responsive Breakpoint Indicators (for debugging) */
.show-breakpoints .responsive-container::before {
    content: attr(data-breakpoint);
    position: fixed;
    top: 0;
    right: 0;
    background: var(--vscode-button-bg);
    color: var(--vscode-button-fg);
    padding: var(--space-1) var(--space-2);
    font-size: var(--font-size-xs);
    z-index: 9999;
    border-radius: 0 0 0 var(--radius-base);
}

.show-breakpoints .grid-item::after {
    content: attr(data-grid-position);
    position: absolute;
    top: var(--space-1);
    right: var(--space-1);
    background: rgba(255, 0, 0, 0.2);
    color: #fff;
    padding: 0 var(--space-1);
    font-size: 10px;
    border-radius: var(--radius-sm);
}
`;

// Responsive utility functions
export function getResponsiveValue<T>(
    values: { mobile?: T; tablet?: T; desktop?: T; wide?: T }
): T | undefined {
    const responsiveManager = ResponsiveManager.getInstance();
    return responsiveManager.getResponsiveValue(values);
}

export function onResize(handler: () => void): () => void {
    const responsiveManager = ResponsiveManager.getInstance();
    const id = `handler-${Date.now()}-${Math.random()}`;

    responsiveManager.addResizeHandler(id, handler);

    // Return cleanup function
    return () => {
        responsiveManager.removeResizeHandler(id);
    };
}