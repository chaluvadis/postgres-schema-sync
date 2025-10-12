import * as vscode from 'vscode';
import { Logger } from '@/utils/Logger';

export interface AccessibilitySettings {
    enableScreenReader: boolean;
    enableHighContrast: boolean;
    enableKeyboardNavigation: boolean;
    enableFocusIndicators: boolean;
    enableReducedMotion: boolean;
    fontSize: 'small' | 'medium' | 'large' | 'extra-large';
    announceLiveRegions: boolean;
    enableSoundFeedback: boolean;
}

export interface AccessibleElement {
    id: string;
    element: HTMLElement;
    role: string;
    label: string;
    description?: string;
    keyboardShortcuts?: string[];
    children?: AccessibleElement[];
}

export class AccessibilityManager {
    private static instance: AccessibilityManager;
    private settings: AccessibilitySettings;
    private liveRegion: HTMLElement | null = null;
    private focusManager: FocusManager;
    private keyboardNavigation: KeyboardNavigation;
    private screenReader: ScreenReaderSupport;

    private constructor() {
        this.settings = this.loadSettings();
        this.focusManager = new FocusManager();
        this.keyboardNavigation = new KeyboardNavigation();
        this.screenReader = new ScreenReaderSupport();
        this.initializeAccessibility();
    }

    static getInstance(): AccessibilityManager {
        if (!AccessibilityManager.instance) {
            AccessibilityManager.instance = new AccessibilityManager();
        }
        return AccessibilityManager.instance;
    }

    private loadSettings(): AccessibilitySettings {
        const config = vscode.workspace.getConfiguration('postgresql.accessibility');

        return {
            enableScreenReader: config.get('enableScreenReader', true),
            enableHighContrast: config.get('enableHighContrast', false),
            enableKeyboardNavigation: config.get('enableKeyboardNavigation', true),
            enableFocusIndicators: config.get('enableFocusIndicators', true),
            enableReducedMotion: config.get('enableReducedMotion', false),
            fontSize: config.get('fontSize', 'medium'),
            announceLiveRegions: config.get('announceLiveRegions', true),
            enableSoundFeedback: config.get('enableSoundFeedback', false)
        };
    }

    private initializeAccessibility(): void {
        this.createLiveRegion();
        this.applyAccessibilitySettings();
        this.setupGlobalKeyboardHandlers();
        this.enhanceVSCodeIntegration();
    }

    private createLiveRegion(): void {
        // Create a live region for announcements
        this.liveRegion = document.createElement('div');
        this.liveRegion.setAttribute('aria-live', 'polite');
        this.liveRegion.setAttribute('aria-atomic', 'true');
        this.liveRegion.setAttribute('role', 'status');
        this.liveRegion.style.position = 'absolute';
        this.liveRegion.style.left = '-10000px';
        this.liveRegion.style.width = '1px';
        this.liveRegion.style.height = '1px';
        this.liveRegion.style.overflow = 'hidden';
        document.body.appendChild(this.liveRegion);
    }

    private applyAccessibilitySettings(): void {
        const root = document.documentElement;

        // Apply high contrast mode
        if (this.settings.enableHighContrast) {
            root.classList.add('high-contrast');
        }

        // Apply reduced motion
        if (this.settings.enableReducedMotion) {
            root.classList.add('reduced-motion');
        }

        // Apply font size
        root.classList.add(`font-size-${this.settings.fontSize}`);

        // Apply focus indicators
        if (!this.settings.enableFocusIndicators) {
            root.classList.add('no-focus-indicators');
        }
    }

    private setupGlobalKeyboardHandlers(): void {
        document.addEventListener('keydown', (event) => {
            this.handleGlobalKeyboard(event);
        });
    }

    private handleGlobalKeyboard(event: KeyboardEvent): void {
        // Handle global accessibility shortcuts
        if (event.ctrlKey && event.shiftKey) {
            switch (event.key) {
                case 'A':
                    event.preventDefault();
                    this.toggleScreenReader();
                    break;
                case 'H':
                    event.preventDefault();
                    this.toggleHighContrast();
                    break;
                case 'M':
                    event.preventDefault();
                    this.toggleReducedMotion();
                    break;
                case 'F':
                    event.preventDefault();
                    this.focusFirstInteractiveElement();
                    break;
            }
        }
    }

    private enhanceVSCodeIntegration(): void {
        // Listen for VSCode theme changes
        vscode.window.onDidChangeActiveColorTheme(() => {
            this.updateThemeAccessibility();
        });

        // Listen for configuration changes
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('postgresql.accessibility')) {
                this.settings = this.loadSettings();
                this.applyAccessibilitySettings();
            }
        });
    }

    private updateThemeAccessibility(): void {
        const theme = vscode.window.activeColorTheme;
        const isDark = theme.kind === vscode.ColorThemeKind.Dark;
        const isHighContrast = theme.kind === vscode.ColorThemeKind.HighContrast;

        // Update accessibility features based on theme
        if (isHighContrast) {
            this.enableHighContrastMode();
        }

        this.announceToScreenReader(`Theme changed`);
    }

    // Public API Methods
    announceToScreenReader(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
        if (!this.settings.enableScreenReader || !this.settings.announceLiveRegions) {
            return;
        }

        if (this.liveRegion) {
            this.liveRegion.setAttribute('aria-live', priority);
            this.liveRegion.textContent = message;

            // Clear after announcement
            setTimeout(() => {
                if (this.liveRegion) {
                    this.liveRegion.textContent = '';
                }
            }, 1000);
        }

        Logger.debug('Screen reader announcement', 'announceToScreenReader', { message, priority });
    }

    makeElementAccessible(element: HTMLElement, options: {
        role?: string;
        label: string;
        description?: string;
        keyboardShortcuts?: string[];
        expanded?: boolean;
        checked?: boolean;
        disabled?: boolean;
    }): void {
        // Set ARIA attributes
        if (options.role) {
            element.setAttribute('role', options.role);
        }

        element.setAttribute('aria-label', options.label);

        if (options.description) {
            element.setAttribute('aria-describedby', options.description);
        }

        if (options.keyboardShortcuts && options.keyboardShortcuts.length > 0) {
            element.setAttribute('aria-keyshortcuts', options.keyboardShortcuts.join(' '));
        }

        if (options.expanded !== undefined) {
            element.setAttribute('aria-expanded', options.expanded.toString());
        }

        if (options.checked !== undefined) {
            element.setAttribute('aria-checked', options.checked.toString());
        }

        if (options.disabled !== undefined) {
            element.setAttribute('aria-disabled', options.disabled.toString());
        }

        // Add tab index for keyboard navigation
        if (this.settings.enableKeyboardNavigation && !element.hasAttribute('tabindex')) {
            const tagName = element.tagName.toLowerCase();
            const interactiveElements = ['button', 'input', 'select', 'textarea', 'a'];

            if (interactiveElements.includes(tagName) || options.role === 'button') {
                element.setAttribute('tabindex', options.disabled ? '-1' : '0');
            }
        }

        // Add focus indicators
        if (this.settings.enableFocusIndicators) {
            element.classList.add('focus-visible');
        }
    }

    setupKeyboardNavigation(container: HTMLElement): void {
        this.keyboardNavigation.setupNavigation(container);
    }

    manageFocus(element: HTMLElement, action: 'focus' | 'blur' | 'trap' | 'restore'): void {
        this.focusManager.manageFocus(element, action);
    }

    enableHighContrastMode(): void {
        document.documentElement.classList.add('high-contrast');
        this.settings.enableHighContrast = true;
        this.saveSettings();
        this.announceToScreenReader('High contrast mode enabled');
    }

    disableHighContrastMode(): void {
        document.documentElement.classList.remove('high-contrast');
        this.settings.enableHighContrast = false;
        this.saveSettings();
        this.announceToScreenReader('High contrast mode disabled');
    }

    toggleHighContrast(): void {
        if (this.settings.enableHighContrast) {
            this.disableHighContrastMode();
        } else {
            this.enableHighContrastMode();
        }
    }

    toggleScreenReader(): void {
        this.settings.enableScreenReader = !this.settings.enableScreenReader;
        this.saveSettings();

        if (this.settings.enableScreenReader) {
            this.announceToScreenReader('Screen reader support enabled');
        } else {
            this.announceToScreenReader('Screen reader support disabled');
        }
    }

    toggleReducedMotion(): void {
        this.settings.enableReducedMotion = !this.settings.enableReducedMotion;
        document.documentElement.classList.toggle('reduced-motion', this.settings.enableReducedMotion);
        this.saveSettings();

        if (this.settings.enableReducedMotion) {
            this.announceToScreenReader('Reduced motion enabled');
        } else {
            this.announceToScreenReader('Reduced motion disabled');
        }
    }

    focusFirstInteractiveElement(): void {
        const focusableElements = document.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );

        if (focusableElements.length > 0) {
            (focusableElements[0] as HTMLElement).focus();
            this.announceToScreenReader('Focused first interactive element');
        }
    }

    private saveSettings(): void {
        const config = vscode.workspace.getConfiguration('postgresql.accessibility');
        config.update('enableScreenReader', this.settings.enableScreenReader, vscode.ConfigurationTarget.Global);
        config.update('enableHighContrast', this.settings.enableHighContrast, vscode.ConfigurationTarget.Global);
        config.update('enableReducedMotion', this.settings.enableReducedMotion, vscode.ConfigurationTarget.Global);
    }

    getSettings(): AccessibilitySettings {
        return { ...this.settings };
    }

    updateSettings(newSettings: Partial<AccessibilitySettings>): void {
        this.settings = { ...this.settings, ...newSettings };
        this.applyAccessibilitySettings();
        this.saveSettings();
    }
}

class FocusManager {
    private focusStack: HTMLElement[] = [];

    manageFocus(element: HTMLElement, action: 'focus' | 'blur' | 'trap' | 'restore'): void {
        switch (action) {
            case 'focus':
                element.focus();
                break;
            case 'blur':
                element.blur();
                break;
            case 'trap':
                this.trapFocus(element);
                break;
            case 'restore':
                this.restoreFocus();
                break;
        }
    }

    private trapFocus(container: HTMLElement): void {
        const focusableElements = container.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );

        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

        const trapFocus = (event: KeyboardEvent) => {
            if (event.key === 'Tab') {
                if (event.shiftKey) {
                    if (document.activeElement === firstElement) {
                        event.preventDefault();
                        lastElement.focus();
                    }
                } else {
                    if (document.activeElement === lastElement) {
                        event.preventDefault();
                        firstElement.focus();
                    }
                }
            }
        };

        container.addEventListener('keydown', trapFocus);

        // Store the trap function for cleanup
        (container as any)._focusTrap = trapFocus;
    }

    private restoreFocus(): void {
        if (this.focusStack.length > 0) {
            const element = this.focusStack.pop()!;
            element.focus();
        }
    }

    pushFocus(element: HTMLElement): void {
        this.focusStack.push(element);
    }

    popFocus(): HTMLElement | undefined {
        return this.focusStack.pop();
    }
}

class KeyboardNavigation {
    private navigationMaps: Map<HTMLElement, Map<string, HTMLElement>> = new Map();

    setupNavigation(container: HTMLElement): void {
        const navigationMap = this.createNavigationMap(container);
        this.navigationMaps.set(container, navigationMap);

        container.addEventListener('keydown', (event) => {
            this.handleNavigationKeydown(event, container);
        });
    }

    private createNavigationMap(container: HTMLElement): Map<string, HTMLElement> {
        const map = new Map<string, HTMLElement>();
        const focusableElements = container.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );

        focusableElements.forEach((element, index) => {
            const key = `element-${index}`;
            map.set(key, element as HTMLElement);

            // Add custom navigation data
            if (element.hasAttribute('data-nav-up')) {
                map.set(`up-${element.getAttribute('data-nav-up')}`, element as HTMLElement);
            }
            if (element.hasAttribute('data-nav-down')) {
                map.set(`down-${element.getAttribute('data-nav-down')}`, element as HTMLElement);
            }
            if (element.hasAttribute('data-nav-left')) {
                map.set(`left-${element.getAttribute('data-nav-left')}`, element as HTMLElement);
            }
            if (element.hasAttribute('data-nav-right')) {
                map.set(`right-${element.getAttribute('data-nav-right')}`, element as HTMLElement);
            }
        });

        return map;
    }

    private handleNavigationKeydown(event: KeyboardEvent, container: HTMLElement): void {
        const navigationMap = this.navigationMaps.get(container);
        if (!navigationMap) return;

        let targetElement: HTMLElement | undefined;

        switch (event.key) {
            case 'ArrowUp':
                targetElement = this.findNavigationTarget(navigationMap, 'up', event.target as HTMLElement);
                break;
            case 'ArrowDown':
                targetElement = this.findNavigationTarget(navigationMap, 'down', event.target as HTMLElement);
                break;
            case 'ArrowLeft':
                targetElement = this.findNavigationTarget(navigationMap, 'left', event.target as HTMLElement);
                break;
            case 'ArrowRight':
                targetElement = this.findNavigationTarget(navigationMap, 'right', event.target as HTMLElement);
                break;
            case 'Home':
                targetElement = this.findFirstFocusable(navigationMap);
                break;
            case 'End':
                targetElement = this.findLastFocusable(navigationMap);
                break;
        }

        if (targetElement && targetElement !== event.target) {
            event.preventDefault();
            targetElement.focus();
        }
    }

    private findNavigationTarget(
        navigationMap: Map<string, HTMLElement>,
        direction: string,
        currentElement: HTMLElement
    ): HTMLElement | undefined {
        // First try custom navigation
        const customTarget = navigationMap.get(`${direction}-${currentElement.id}`) ||
            navigationMap.get(`${direction}-${this.getElementIndex(currentElement)}`);

        if (customTarget) {
            return customTarget;
        }

        // Fall back to spatial navigation
        return this.findSpatialTarget(navigationMap, direction, currentElement);
    }

    private findSpatialTarget(
        navigationMap: Map<string, HTMLElement>,
        direction: string,
        currentElement: HTMLElement
    ): HTMLElement | undefined {
        const elements = Array.from(navigationMap.values());
        const currentIndex = elements.indexOf(currentElement);

        if (currentIndex === -1) return undefined;

        switch (direction) {
            case 'up':
                // Find element above current element
                return this.findElementInDirection(elements, currentIndex, -1);
            case 'down':
                return this.findElementInDirection(elements, currentIndex, 1);
            case 'left':
            case 'right':
                // For left/right, we'd need position information
                // For now, just return adjacent elements
                return direction === 'left'
                    ? (currentIndex > 0 ? elements[currentIndex - 1] : undefined)
                    : (currentIndex < elements.length - 1 ? elements[currentIndex + 1] : undefined);
        }

        return undefined;
    }

    private findElementInDirection(
        elements: HTMLElement[],
        currentIndex: number,
        direction: number
    ): HTMLElement | undefined {
        // This is a simplified implementation
        // A full implementation would calculate actual positions
        const nextIndex = currentIndex + direction;
        return nextIndex >= 0 && nextIndex < elements.length ? elements[nextIndex] : undefined;
    }

    private findFirstFocusable(navigationMap: Map<string, HTMLElement>): HTMLElement | undefined {
        return navigationMap.get('element-0') || undefined;
    }

    private findLastFocusable(navigationMap: Map<string, HTMLElement>): HTMLElement | undefined {
        const elements = Array.from(navigationMap.values());
        return elements[elements.length - 1];
    }

    private getElementIndex(element: HTMLElement): string {
        return element.getAttribute('data-nav-index') || element.id || '0';
    }
}

class ScreenReaderSupport {
    private announcements: string[] = [];
    private announcementTimer: NodeJS.Timeout | null = null;

    announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
        this.announcements.push(message);

        if (!this.announcementTimer) {
            this.processAnnouncements();
        }
    }

    private processAnnouncements(): void {
        if (this.announcements.length === 0) return;

        const message = this.announcements.shift()!;

        // Create a temporary element for announcement
        const announcement = document.createElement('div');
        announcement.setAttribute('aria-live', 'polite');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.style.position = 'absolute';
        announcement.style.left = '-10000px';
        announcement.style.width = '1px';
        announcement.style.height = '1px';
        announcement.style.overflow = 'hidden';

        document.body.appendChild(announcement);
        announcement.textContent = message;

        // Remove after announcement
        setTimeout(() => {
            document.body.removeChild(announcement);

            if (this.announcements.length > 0) {
                this.announcementTimer = setTimeout(() => {
                    this.processAnnouncements();
                }, 100);
            } else {
                this.announcementTimer = null;
            }
        }, 1000);
    }

    describeElement(element: HTMLElement): string {
        const descriptions: string[] = [];

        // Basic description
        if (element.textContent) {
            descriptions.push(element.textContent.trim());
        }

        // ARIA description
        if (element.hasAttribute('aria-label')) {
            descriptions.push(element.getAttribute('aria-label')!);
        }

        // Role description
        if (element.hasAttribute('role')) {
            const role = element.getAttribute('role')!;
            descriptions.push(`${role} element`);
        }

        // State descriptions
        if (element.hasAttribute('aria-expanded')) {
            const expanded = element.getAttribute('aria-expanded') === 'true';
            descriptions.push(expanded ? 'expanded' : 'collapsed');
        }

        if (element.hasAttribute('aria-checked')) {
            const checked = element.getAttribute('aria-checked') === 'true';
            descriptions.push(checked ? 'checked' : 'unchecked');
        }

        if (element.hasAttribute('aria-disabled')) {
            const disabled = element.getAttribute('aria-disabled') === 'true';
            descriptions.push(disabled ? 'disabled' : 'enabled');
        }

        return descriptions.join(', ');
    }

    announceElementFocused(element: HTMLElement): void {
        const description = this.describeElement(element);
        if (description) {
            this.announce(`Focused: ${description}`);
        }
    }

    announceAction(action: string, target?: string): void {
        const message = target ? `${action} ${target}` : action;
        this.announce(message, 'assertive');
    }
}

// Global accessibility utilities
export function createAccessibleElement(
    tagName: string,
    options: {
        role?: string;
        label: string;
        description?: string;
        keyboardShortcuts?: string[];
        className?: string;
        innerHTML?: string;
        attributes?: Record<string, string>;
    }
): HTMLElement {
    const element = document.createElement(tagName);

    if (options.className) {
        element.className = options.className;
    }

    if (options.innerHTML) {
        element.innerHTML = options.innerHTML;
    }

    // Apply accessibility attributes
    const accessibilityManager = AccessibilityManager.getInstance();
    accessibilityManager.makeElementAccessible(element, {
        role: options.role,
        label: options.label,
        description: options.description,
        keyboardShortcuts: options.keyboardShortcuts
    });

    // Apply custom attributes
    if (options.attributes) {
        Object.entries(options.attributes).forEach(([key, value]) => {
            element.setAttribute(key, value);
        });
    }

    return element;
}

export function announceToScreenReader(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
    AccessibilityManager.getInstance().announceToScreenReader(message, priority);
}

export function setupAccessibleKeyboardNavigation(container: HTMLElement): void {
    AccessibilityManager.getInstance().setupKeyboardNavigation(container);
}

// CSS for accessibility features
export const accessibilityCSS = `
/* High Contrast Mode */
.high-contrast {
    --vscode-border-primary: #ffffff !important;
    --vscode-fg-secondary: #ffffff !important;
    --vscode-bg-secondary: #000000 !important;
    --vscode-bg-tertiary: #000000 !important;
    --vscode-input-bg: #000000 !important;
    --vscode-button-bg: #ffffff !important;
    --vscode-button-fg: #000000 !important;
}

.high-contrast * {
    border-color: #ffffff !important;
    text-shadow: none !important;
    box-shadow: none !important;
}

/* Reduced Motion */
.reduced-motion *,
.reduced-motion *::before,
.reduced-motion *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
}

/* Font Size Variations */
.font-size-small {
    font-size: 11px;
}

.font-size-large {
    font-size: 15px;
}

.font-size-extra-large {
    font-size: 17px;
}

/* Focus Indicators */
.focus-visible:focus-visible {
    outline: 2px solid var(--vscode-border-focus) !important;
    outline-offset: 2px !important;
}

.no-focus-indicators *:focus {
    outline: none !important;
}

/* Screen Reader Only Content */
.sr-only {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    padding: 0 !important;
    margin: -1px !important;
    overflow: hidden !important;
    clip: rect(0, 0, 0, 0) !important;
    white-space: nowrap !important;
    border: 0 !important;
}

/* High Contrast Borders */
.high-contrast .card,
.high-contrast .btn,
.high-contrast .input {
    border-width: 2px !important;
    border-color: #ffffff !important;
}

/* Accessible Color Combinations */
.high-contrast .text-primary {
    color: #ffffff !important;
}

.high-contrast .bg-primary {
    background-color: #000000 !important;
}

/* Focus Management */
.focus-trap {
    position: relative;
}

.focus-trap::before,
.focus-trap::after {
    content: '';
    position: fixed;
    top: 0;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
}

/* Keyboard Navigation Indicators */
.keyboard-navigation [data-nav-up],
.keyboard-navigation [data-nav-down],
.keyboard-navigation [data-nav-left],
.keyboard-navigation [data-nav-right] {
    position: relative;
}

.keyboard-navigation [data-nav-up]::after {
    content: '↑';
    position: absolute;
    top: -20px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 12px;
    color: var(--vscode-textLink-foreground);
    opacity: 0.7;
}

/* Accessible Form Elements */
.accessible-form .form-group {
    margin-bottom: var(--space-6);
}

.accessible-form .form-label {
    font-weight: var(--font-weight-semibold);
    margin-bottom: var(--space-2);
}

.accessible-form .form-input:focus,
.accessible-form .form-select:focus,
.accessible-form .form-textarea:focus {
    border-color: var(--vscode-border-focus);
    box-shadow: 0 0 0 1px var(--vscode-border-focus);
}

/* Accessible Buttons */
.accessible-btn {
    position: relative;
    overflow: hidden;
}

.accessible-btn:focus {
    outline: 2px solid var(--vscode-border-focus);
    outline-offset: 2px;
}

.accessible-btn::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--vscode-border-focus);
    opacity: 0;
    transition: opacity var(--transition-fast);
}

.accessible-btn:focus::before {
    opacity: 0.2;
}

/* Accessible Lists */
.accessible-list {
    list-style: none;
    padding: 0;
    margin: 0;
}

.accessible-list-item {
    padding: var(--space-3);
    border-bottom: 1px solid var(--vscode-border-primary);
    transition: background-color var(--transition-fast);
}

.accessible-list-item:focus,
.accessible-list-item:hover {
    background: var(--vscode-list-hover-bg);
}

.accessible-list-item:last-child {
    border-bottom: none;
}

/* Accessible Tables */
.accessible-table {
    border-collapse: collapse;
    width: 100%;
}

.accessible-table th,
.accessible-table td {
    padding: var(--space-3);
    text-align: left;
    border-bottom: 1px solid var(--vscode-border-primary);
}

.accessible-table th {
    background: var(--vscode-bg-secondary);
    font-weight: var(--font-weight-semibold);
    position: sticky;
    top: 0;
}

.accessible-table th:focus {
    outline: 2px solid var(--vscode-border-focus);
    outline-offset: -2px;
}

/* Accessible Modals */
.accessible-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal);
    padding: var(--space-4);
}

.accessible-modal-content {
    background: var(--vscode-bg-primary);
    border: 2px solid var(--vscode-border-primary);
    border-radius: var(--radius-lg);
    max-width: 90vw;
    max-height: 90vh;
    overflow: auto;
    padding: var(--space-6);
}

.accessible-modal:focus {
    outline: 2px solid var(--vscode-border-focus);
    outline-offset: -4px;
}

/* Accessible Tooltips */
.accessible-tooltip {
    position: relative;
    cursor: help;
}

.accessible-tooltip::before,
.accessible-tooltip::after {
    position: absolute;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--transition-base);
    z-index: var(--z-tooltip);
}

.accessible-tooltip::before {
    content: attr(data-tooltip);
    background: var(--vscode-bg-tertiary);
    color: var(--vscode-fg-primary);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-base);
    white-space: nowrap;
    font-size: var(--font-size-sm);
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%) translateY(-4px);
}

.accessible-tooltip::after {
    content: '';
    width: 0;
    height: 0;
    border-left: 4px solid transparent;
    border-right: 4px solid transparent;
    border-top: 4px solid var(--vscode-bg-tertiary);
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
}

.accessible-tooltip:hover::before,
.accessible-tooltip:hover::after,
.accessible-tooltip:focus::before,
.accessible-tooltip:focus::after {
    opacity: 1;
}

/* Accessible Progress Indicators */
.accessible-progress {
    width: 100%;
    height: 6px;
    background: var(--vscode-bg-tertiary);
    border-radius: 3px;
    overflow: hidden;
    position: relative;
}

.accessible-progress::before {
    content: attr(data-progress-text);
    position: absolute;
    top: -20px;
    left: 0;
    font-size: var(--font-size-sm);
    color: var(--vscode-fg-secondary);
}

.accessible-progress-fill {
    height: 100%;
    background: var(--postgresql-primary);
    transition: width var(--transition-base);
    position: relative;
}

.accessible-progress-fill::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
    animation: shimmer 2s infinite;
}

@keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
}

/* Accessible Status Messages */
.accessible-status {
    padding: var(--space-3);
    border-radius: var(--radius-base);
    font-weight: var(--font-weight-medium);
    margin: var(--space-2) 0;
}

.accessible-status.success {
    background: rgba(75, 183, 74, 0.2);
    color: var(--postgresql-success);
    border-left: 4px solid var(--postgresql-success);
}

.accessible-status.warning {
    background: rgba(255, 211, 61, 0.2);
    color: var(--postgresql-warning);
    border-left: 4px solid var(--postgresql-warning);
}

.accessible-status.error {
    background: rgba(244, 135, 113, 0.2);
    color: var(--postgresql-error);
    border-left: 4px solid var(--postgresql-error);
}

.accessible-status.info {
    background: rgba(77, 166, 255, 0.2);
    color: var(--postgresql-info);
    border-left: 4px solid var(--postgresql-info);
}

/* Print Accessibility */
@media print {
    .no-print {
        display: none !important;
    }

    .accessible-modal {
        position: static !important;
        background: white !important;
    }

    .accessible-modal-content {
        border: 2px solid #000 !important;
        color: #000 !important;
        background: white !important;
    }
}
`;