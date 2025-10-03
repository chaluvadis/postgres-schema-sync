import * as path from 'path';
import * as fs from 'fs';

/**
 * Simple template engine for VS Code extension views
 * Supports basic variable replacement and conditional rendering
 */
export class TemplateEngine {
    private templatesDir: string;

    constructor(extensionPath: string) {
        this.templatesDir = path.join(extensionPath, 'src', 'views', 'templates');
    }

    /**
     * Load and process a template file with data
     */
    async render(templateName: string, data: any): Promise<string> {
        const templatePath = path.join(this.templatesDir, templateName);

        try {
            // Check if template file exists
            if (!fs.existsSync(templatePath)) {
                throw new Error(`Template file not found: ${templatePath}`);
            }

            const templateContent = await fs.promises.readFile(templatePath, 'utf8');
            return this.replaceTemplateVars(templateContent, data);
        } catch (error) {
            throw new Error(`Failed to render template ${templateName}: ${(error as Error).message}`);
        }
    }

    /**
     * Replace template variables in the format {{variableName}}
     */
    private replaceTemplateVars(template: string, data: any): string {
        return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            const value = this.getNestedValue(data, key);
            return value !== undefined ? String(value) : match;
        });
    }

    /**
     * Get nested value from object using dot notation
     */
    private getNestedValue(obj: any, path: string): any {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }

    /**
     * Load CSS file content
     */
    async loadCss(cssName: string): Promise<string> {
        const cssPath = path.join(this.templatesDir, cssName);

        try {
            if (fs.existsSync(cssPath)) {
                return await fs.promises.readFile(cssPath, 'utf8');
            }
            return '';
        } catch (error) {
            console.warn(`Failed to load CSS file ${cssName}: ${(error as Error).message}`);
            return '';
        }
    }

    /**
     * Load JavaScript file content
     */
    async loadJavaScript(jsName: string): Promise<string> {
        const jsPath = path.join(this.templatesDir, jsName);

        try {
            if (fs.existsSync(jsPath)) {
                return await fs.promises.readFile(jsPath, 'utf8');
            }
            return '';
        } catch (error) {
            console.warn(`Failed to load JavaScript file ${jsName}: ${(error as Error).message}`);
            return '';
        }
    }
}