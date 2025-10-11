import * as vscode from 'vscode';
import { TeamCollaborationService, TeamQueryLibrary } from '@/services/TeamCollaborationService';
import { Logger } from '@/utils/Logger';
import { ErrorHandler } from '@/utils/ErrorHandler';

export class TeamQueryLibraryView {
    private context: vscode.ExtensionContext;
    private collaborationService: TeamCollaborationService;
    private webviewPanel?: vscode.WebviewPanel;
    private currentLibrary?: TeamQueryLibrary;

    constructor(
        context: vscode.ExtensionContext,
        collaborationService: TeamCollaborationService
    ) {
        this.context = context;
        this.collaborationService = collaborationService;
    }

    async showLibrary(libraryId?: string): Promise<void> {
        try {
            Logger.info('Opening team query library', 'showLibrary', { libraryId });

            // Create or focus existing webview panel
            if (!this.webviewPanel) {
                this.webviewPanel = vscode.window.createWebviewPanel(
                    'teamQueryLibrary',
                    'Team Query Library',
                    vscode.ViewColumn.One,
                    {
                        enableScripts: true,
                        retainContextWhenHidden: true,
                        localResourceRoots: [
                            vscode.Uri.file(this.context.extensionPath)
                        ]
                    }
                );

                this.webviewPanel.onDidDispose(() => {
                    this.webviewPanel = undefined;
                }, null, this.context.subscriptions);

                this.setupMessageHandler();
            }

            // Load library data
            await this.loadLibrary(libraryId);

            // Update webview content
            await this.updateWebviewContent();

            this.webviewPanel.reveal();

        } catch (error) {
            Logger.error('Failed to show team library', error as Error);
            ErrorHandler.handleError(error, ErrorHandler.createContext('ShowTeamLibrary'));
        }
    }

    private async loadLibrary(libraryId?: string): Promise<void> {
        try {
            if (libraryId) {
                // Load specific library
                this.currentLibrary = this.collaborationService.getTeamLibraries().find(lib => lib.id === libraryId);
                if (!this.currentLibrary) {
                    throw new Error(`Library ${libraryId} not found`);
                }
            } else {
                // Load user's personal library or create one if it doesn't exist
                const libraries = this.collaborationService.getTeamLibraries();
                this.currentLibrary = libraries.find(lib => lib.name === 'Personal Library');

                if (!this.currentLibrary) {
                    this.currentLibrary = await this.collaborationService.createTeamLibrary({
                        name: 'Personal Library',
                        description: 'My personal query collection',
                        members: [this.collaborationService.getCurrentUser()?.userId || 'current-user'],
                        snippets: [],
                        isPublic: false
                    });
                }
            }

            Logger.info('Library loaded', 'loadLibrary', {
                libraryId: this.currentLibrary.id,
                snippetCount: this.currentLibrary.snippets.length
            });

        } catch (error) {
            Logger.error('Failed to load library', error as Error);
            throw error;
        }
    }

    private setupMessageHandler(): void {
        if (!this.webviewPanel) return;

        this.webviewPanel.webview.onDidReceiveMessage(async (message) => {
            try {
                switch (message.command) {
                    case 'createSnippet':
                        await this.createSnippet(message.snippetData);
                        await this.updateWebviewContent();
                        break;

                    case 'updateSnippet':
                        await this.updateSnippet(message.snippetId, message.updates);
                        await this.updateWebviewContent();
                        break;

                    case 'deleteSnippet':
                        await this.deleteSnippet(message.snippetId);
                        await this.updateWebviewContent();
                        break;

                    case 'searchSnippets':
                        await this.searchSnippets(message.query, message.filters);
                        break;

                    case 'importSnippets':
                        await this.importSnippets(message.data, message.format);
                        await this.updateWebviewContent();
                        break;

                    case 'exportLibrary':
                        await this.exportLibrary(message.format);
                        break;

                    case 'addComment':
                        await this.addComment(message.snippetId, message.content);
                        await this.updateWebviewContent();
                        break;

                    case 'useSnippet':
                        await this.useSnippet(message.snippetId);
                        break;

                    case 'createLibrary':
                        await this.createLibrary(message.libraryData);
                        await this.updateWebviewContent();
                        break;
                }
            } catch (error) {
                Logger.error('Error handling library message', error as Error);
                ErrorHandler.handleError(error, ErrorHandler.createContext('LibraryMessage'));
            }
        });
    }

    private async createSnippet(snippetData: any): Promise<void> {
        try {
            if (!this.currentLibrary) {
                throw new Error('No library selected');
            }

            const snippet = await this.collaborationService.createSnippet({
                ...snippetData,
                teamId: this.currentLibrary.id,
                isPublic: this.currentLibrary.isPublic
            });

            // Add to current library
            this.currentLibrary.snippets.push(snippet);
            this.currentLibrary.updatedAt = new Date();

            vscode.window.showInformationMessage(`Snippet "${snippet.name}" created successfully`);

        } catch (error) {
            Logger.error('Failed to create snippet', error as Error);
            vscode.window.showErrorMessage(`Failed to create snippet: ${(error as Error).message}`);
        }
    }

    private async updateSnippet(snippetId: string, updates: any): Promise<void> {
        try {
            await this.collaborationService.updateSnippet(snippetId, updates);

            // Update in current library
            if (this.currentLibrary) {
                const snippetIndex = this.currentLibrary.snippets.findIndex(s => s.id === snippetId);
                if (snippetIndex >= 0) {
                    this.currentLibrary.snippets[snippetIndex] = {
                        ...this.currentLibrary.snippets[snippetIndex],
                        ...updates,
                        updatedAt: new Date()
                    };
                    this.currentLibrary.updatedAt = new Date();
                }
            }

            vscode.window.showInformationMessage('Snippet updated successfully');

        } catch (error) {
            Logger.error('Failed to update snippet', error as Error);
            vscode.window.showErrorMessage(`Failed to update snippet: ${(error as Error).message}`);
        }
    }

    private async deleteSnippet(snippetId: string): Promise<void> {
        try {
            const snippet = this.collaborationService.getSnippet(snippetId);
            if (!snippet) {
                throw new Error('Snippet not found');
            }

            const confirm = await vscode.window.showWarningMessage(
                `Are you sure you want to delete snippet "${snippet.name}"?`,
                'Delete', 'Cancel'
            );

            if (confirm === 'Delete') {
                await this.collaborationService.deleteSnippet(snippetId);

                // Remove from current library
                if (this.currentLibrary) {
                    this.currentLibrary.snippets = this.currentLibrary.snippets.filter(s => s.id !== snippetId);
                    this.currentLibrary.updatedAt = new Date();
                }

                vscode.window.showInformationMessage('Snippet deleted successfully');
            }

        } catch (error) {
            Logger.error('Failed to delete snippet', error as Error);
            vscode.window.showErrorMessage(`Failed to delete snippet: ${(error as Error).message}`);
        }
    }

    private async searchSnippets(query: string, filters: any): Promise<void> {
        try {
            const snippets = await this.collaborationService.searchSnippets(query, filters);

            this.webviewPanel?.webview.postMessage({
                command: 'searchResults',
                snippets: snippets
            });

        } catch (error) {
            Logger.error('Failed to search snippets', error as Error);
        }
    }

    private async importSnippets(data: string, format: 'json' | 'sql'): Promise<void> {
        try {
            const importedCount = await this.collaborationService.importSnippets(
                data,
                format,
                this.currentLibrary?.id
            );

            vscode.window.showInformationMessage(`${importedCount} snippets imported successfully`);

        } catch (error) {
            Logger.error('Failed to import snippets', error as Error);
            vscode.window.showErrorMessage(`Import failed: ${(error as Error).message}`);
        }
    }

    private async exportLibrary(format: 'json' | 'sql'): Promise<void> {
        try {
            if (!this.currentLibrary) {
                throw new Error('No library selected');
            }

            const content = await this.collaborationService.exportLibrary(this.currentLibrary.id, format);

            const uri = await vscode.window.showSaveDialog({
                filters: {
                    'JSON': ['json'],
                    'SQL': ['sql']
                },
                defaultUri: vscode.Uri.file(`library_${this.currentLibrary.name}_${Date.now()}.${format}`)
            });

            if (uri) {
                const fs = require('fs').promises;
                await fs.writeFile(uri.fsPath, content, 'utf8');
                vscode.window.showInformationMessage(`Library exported to ${uri.fsPath}`);
            }

        } catch (error) {
            Logger.error('Failed to export library', error as Error);
            vscode.window.showErrorMessage(`Export failed: ${(error as Error).message}`);
        }
    }

    private async addComment(snippetId: string, content: string): Promise<void> {
        try {
            await this.collaborationService.addComment(snippetId, content);
            vscode.window.showInformationMessage('Comment added successfully');

        } catch (error) {
            Logger.error('Failed to add comment', error as Error);
            vscode.window.showErrorMessage(`Failed to add comment: ${(error as Error).message}`);
        }
    }

    private async useSnippet(snippetId: string): Promise<void> {
        try {
            const snippet = this.collaborationService.getSnippet(snippetId);
            if (!snippet) {
                throw new Error('Snippet not found');
            }

            // Increment usage count
            await this.collaborationService.incrementSnippetUsage(snippetId);

            // Copy snippet to clipboard or open in query editor
            await vscode.env.clipboard.writeText(snippet.query);
            vscode.window.showInformationMessage(`Snippet "${snippet.name}" copied to clipboard and usage tracked`);

        } catch (error) {
            Logger.error('Failed to use snippet', error as Error);
            vscode.window.showErrorMessage(`Failed to use snippet: ${(error as Error).message}`);
        }
    }

    private async createLibrary(libraryData: any): Promise<void> {
        try {
            const library = await this.collaborationService.createTeamLibrary(libraryData);
            this.currentLibrary = library;

            vscode.window.showInformationMessage(`Library "${library.name}" created successfully`);

        } catch (error) {
            Logger.error('Failed to create library', error as Error);
            vscode.window.showErrorMessage(`Failed to create library: ${(error as Error).message}`);
        }
    }

    private async updateWebviewContent(): Promise<void> {
        if (!this.webviewPanel || !this.currentLibrary) return;

        const html = await this.generateLibraryHtml(this.currentLibrary);
        this.webviewPanel.webview.html = html;
    }

    private async generateLibraryHtml(library: TeamQueryLibrary): Promise<string> {
        const stats = this.collaborationService.getCollaborationStats();
        const categories = this.collaborationService.getCategories();
        const tags = this.collaborationService.getAllTags();

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Team Query Library - ${library.name}</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        margin: 0;
                        padding: 20px;
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                    }

                    .header {
                        margin-bottom: 30px;
                        padding-bottom: 20px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }

                    .library-info {
                        background: var(--vscode-textBlockQuote-background);
                        padding: 15px;
                        border-radius: 8px;
                        border: 1px solid var(--vscode-textBlockQuote-border);
                        margin-bottom: 20px;
                    }

                    .controls {
                        margin-bottom: 20px;
                        display: flex;
                        gap: 15px;
                        align-items: center;
                    }

                    .search-section {
                        margin-bottom: 20px;
                        padding: 15px;
                        background: var(--vscode-editorWidget-background);
                        border-radius: 8px;
                        border: 1px solid var(--vscode-panel-border);
                    }

                    .search-input {
                        width: 100%;
                        padding: 8px;
                        border: 1px solid var(--vscode-input-border);
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border-radius: 4px;
                        margin-bottom: 10px;
                    }

                    .filter-controls {
                        display: flex;
                        gap: 15px;
                        flex-wrap: wrap;
                        align-items: center;
                    }

                    .snippets-grid {
                        display: grid;
                        gap: 15px;
                    }

                    .snippet-card {
                        background: var(--vscode-textBlockQuote-background);
                        border: 1px solid var(--vscode-textBlockQuote-border);
                        border-radius: 8px;
                        padding: 15px;
                        cursor: pointer;
                        transition: all 0.2s ease;
                    }

                    .snippet-card:hover {
                        background: var(--vscode-list-hoverBackground);
                        border-color: var(--vscode-focusBorder);
                    }

                    .snippet-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: start;
                        margin-bottom: 10px;
                    }

                    .snippet-title {
                        font-weight: bold;
                        color: var(--vscode-textLink-foreground);
                        margin: 0;
                    }

                    .snippet-category {
                        background: var(--vscode-badge-background);
                        color: var(--vscode-badge-foreground);
                        padding: 2px 8px;
                        border-radius: 12px;
                        font-size: 0.8em;
                    }

                    .snippet-description {
                        color: var(--vscode-descriptionForeground);
                        font-size: 0.9em;
                        margin-bottom: 10px;
                        line-height: 1.4;
                    }

                    .snippet-query {
                        background: var(--vscode-textCodeBlock-background);
                        border: 1px solid var(--vscode-textBlockQuote-border);
                        border-radius: 4px;
                        padding: 10px;
                        font-family: 'Courier New', monospace;
                        font-size: 0.8em;
                        max-height: 100px;
                        overflow-y: auto;
                        margin-bottom: 10px;
                    }

                    .snippet-footer {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        font-size: 0.8em;
                        color: var(--vscode-descriptionForeground);
                    }

                    .snippet-tags {
                        display: flex;
                        gap: 5px;
                        flex-wrap: wrap;
                    }

                    .tag {
                        background: var(--vscode-button-secondaryBackground);
                        color: var(--vscode-button-secondaryForeground);
                        padding: 2px 6px;
                        border-radius: 8px;
                        font-size: 0.7em;
                    }

                    .snippet-actions {
                        display: flex;
                        gap: 5px;
                    }

                    .btn {
                        padding: 4px 8px;
                        border: 1px solid var(--vscode-button-border);
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 0.8em;
                    }

                    .btn:hover {
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
                        padding: 2px 6px;
                        font-size: 0.7em;
                    }

                    .stats-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                        gap: 15px;
                        margin-bottom: 20px;
                    }

                    .stat-card {
                        background: var(--vscode-textBlockQuote-background);
                        padding: 15px;
                        border-radius: 8px;
                        border: 1px solid var(--vscode-textBlockQuote-border);
                        text-align: center;
                    }

                    .stat-value {
                        font-size: 1.5em;
                        font-weight: bold;
                        color: var(--vscode-textLink-foreground);
                    }

                    .stat-label {
                        color: var(--vscode-descriptionForeground);
                        margin-top: 5px;
                        font-size: 0.9em;
                    }

                    .create-form {
                        background: var(--vscode-editorWidget-background);
                        padding: 20px;
                        border-radius: 8px;
                        border: 1px solid var(--vscode-panel-border);
                        margin-bottom: 20px;
                    }

                    .form-group {
                        margin-bottom: 15px;
                    }

                    .form-group label {
                        display: block;
                        margin-bottom: 5px;
                        font-weight: bold;
                        color: var(--vscode-textLink-foreground);
                    }

                    .form-group input,
                    .form-group select,
                    .form-group textarea {
                        width: 100%;
                        padding: 8px;
                        border: 1px solid var(--vscode-input-border);
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border-radius: 4px;
                        box-sizing: border-box;
                    }

                    .form-group textarea {
                        min-height: 80px;
                        resize: vertical;
                    }

                    .form-actions {
                        display: flex;
                        gap: 10px;
                        justify-content: flex-end;
                        margin-top: 20px;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>${library.name}</h1>
                    <div class="library-info">
                        <strong>Description:</strong> ${library.description || 'No description'}<br>
                        <strong>Members:</strong> ${library.members.length} |
                        <strong>Snippets:</strong> ${library.snippets.length} |
                        <strong>Public:</strong> ${library.isPublic ? 'Yes' : 'No'}
                    </div>

                    <div class="controls">
                        <button class="btn" onclick="showCreateForm()">Create Snippet</button>
                        <button class="btn" onclick="showImportDialog()">Import</button>
                        <button class="btn btn-secondary" onclick="exportLibrary()">Export</button>
                        <div style="flex: 1;"></div>
                        <button class="btn btn-secondary" onclick="refreshView()">Refresh</button>
                    </div>
                </div>

                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value">${stats.totalSnippets}</div>
                        <div class="stat-label">Total Snippets</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.totalLibraries}</div>
                        <div class="stat-label">Libraries</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.totalComments}</div>
                        <div class="stat-label">Comments</div>
                    </div>
                </div>

                <div class="search-section">
                    <input type="text" class="search-input" id="searchInput" placeholder="Search snippets..." onkeyup="searchSnippets()">

                    <div class="filter-controls">
                        <select id="categoryFilter" onchange="searchSnippets()">
                            <option value="">All Categories</option>
                            ${categories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
                        </select>

                        <select id="authorFilter" onchange="searchSnippets()">
                            <option value="">All Authors</option>
                            ${stats.topAuthors.slice(0, 5).map(author => `<option value="${author.author}">${author.author} (${author.count})</option>`).join('')}
                        </select>

                        <label>
                            <input type="checkbox" id="publicFilter" onchange="searchSnippets()"> Public only
                        </label>
                    </div>
                </div>

                <div id="createForm" class="create-form" style="display: none;">
                    <h3>Create New Snippet</h3>

                    <div class="form-group">
                        <label for="snippetName">Name *</label>
                        <input type="text" id="snippetName" required>
                    </div>

                    <div class="form-group">
                        <label for="snippetCategory">Category *</label>
                        <select id="snippetCategory" required>
                            <option value="">Select Category</option>
                            ${categories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="snippetDescription">Description</label>
                        <textarea id="snippetDescription" placeholder="Optional description..."></textarea>
                    </div>

                    <div class="form-group">
                        <label for="snippetQuery">Query *</label>
                        <textarea id="snippetQuery" placeholder="Enter your SQL query..." required></textarea>
                    </div>

                    <div class="form-group">
                        <label for="snippetTags">Tags (comma-separated)</label>
                        <input type="text" id="snippetTags" placeholder="e.g. select, users, active">
                    </div>

                    <div class="form-actions">
                        <button class="btn btn-secondary" onclick="hideCreateForm()">Cancel</button>
                        <button class="btn" onclick="saveSnippet()">Save Snippet</button>
                    </div>
                </div>

                <div class="snippets-grid" id="snippetsGrid">
                    ${library.snippets.map(snippet => `
                        <div class="snippet-card" onclick="selectSnippet('${snippet.id}')">
                            <div class="snippet-header">
                                <h4 class="snippet-title">${snippet.name}</h4>
                                <span class="snippet-category">${snippet.category}</span>
                            </div>

                            ${snippet.description ? `<div class="snippet-description">${snippet.description}</div>` : ''}

                            <div class="snippet-query" title="${snippet.query}">
                                ${snippet.query.length > 150 ? snippet.query.substring(0, 150) + '...' : snippet.query}
                            </div>

                            <div class="snippet-footer">
                                <div class="snippet-tags">
                                    ${snippet.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                                </div>

                                <div class="snippet-actions">
                                    <button class="btn btn-small" onclick="event.stopPropagation(); useSnippet('${snippet.id}')"
                                            title="Use this snippet">Use</button>
                                    <button class="btn btn-small btn-secondary" onclick="event.stopPropagation(); editSnippet('${snippet.id}')"
                                            title="Edit snippet">Edit</button>
                                    <button class="btn btn-small btn-secondary" onclick="event.stopPropagation(); deleteSnippet('${snippet.id}')"
                                            title="Delete snippet">×</button>
                                </div>
                            </div>

                            <div style="margin-top: 10px; font-size: 0.8em; color: var(--vscode-descriptionForeground);">
                                By ${snippet.author} • Used ${snippet.usageCount} times • Updated ${snippet.updatedAt.toLocaleDateString()}
                            </div>
                        </div>
                    `).join('')}
                </div>

                ${library.snippets.length === 0 ? `
                    <div style="text-align: center; padding: 50px; color: var(--vscode-descriptionForeground);">
                        <p>No snippets in this library yet.</p>
                        <button class="btn" onclick="showCreateForm()">Create Your First Snippet</button>
                    </div>
                ` : ''}

                <script>
                    const vscode = acquireVsCodeApi();

                    function showCreateForm() {
                        document.getElementById('createForm').style.display = 'block';
                    }

                    function hideCreateForm() {
                        document.getElementById('createForm').style.display = 'none';
                        clearForm();
                    }

                    function clearForm() {
                        document.getElementById('snippetName').value = '';
                        document.getElementById('snippetCategory').value = '';
                        document.getElementById('snippetDescription').value = '';
                        document.getElementById('snippetQuery').value = '';
                        document.getElementById('snippetTags').value = '';
                    }

                    function saveSnippet() {
                        const name = document.getElementById('snippetName').value.trim();
                        const category = document.getElementById('snippetCategory').value;
                        const description = document.getElementById('snippetDescription').value.trim();
                        const query = document.getElementById('snippetQuery').value.trim();
                        const tagsInput = document.getElementById('snippetTags').value.trim();

                        if (!name || !category || !query) {
                            alert('Please fill in all required fields (Name, Category, Query)');
                            return;
                        }

                        const tags = tagsInput ? tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag) : [];

                        const snippetData = {
                            name,
                            category,
                            description: description || undefined,
                            query,
                            tags,
                            isPublic: ${library.isPublic}
                        };

                        vscode.postMessage({
                            command: 'createSnippet',
                            snippetData: snippetData
                        });

                        hideCreateForm();
                    }

                    function searchSnippets() {
                        const query = document.getElementById('searchInput').value;
                        const category = document.getElementById('categoryFilter').value;
                        const author = document.getElementById('authorFilter').value;
                        const isPublic = document.getElementById('publicFilter').checked;

                        const filters = {};
                        if (category) filters.category = category;
                        if (author) filters.author = author;
                        if (isPublic) filters.isPublic = true;

                        vscode.postMessage({
                            command: 'searchSnippets',
                            query: query,
                            filters: filters
                        });
                    }

                    function selectSnippet(snippetId) {
                        // Show snippet details or open for editing
                        vscode.postMessage({
                            command: 'selectSnippet',
                            snippetId: snippetId
                        });
                    }

                    function useSnippet(snippetId) {
                        vscode.postMessage({
                            command: 'useSnippet',
                            snippetId: snippetId
                        });
                    }

                    function editSnippet(snippetId) {
                        vscode.postMessage({
                            command: 'editSnippet',
                            snippetId: snippetId
                        });
                    }

                    function deleteSnippet(snippetId) {
                        if (confirm('Are you sure you want to delete this snippet?')) {
                            vscode.postMessage({
                                command: 'deleteSnippet',
                                snippetId: snippetId
                            });
                        }
                    }

                    function exportLibrary() {
                        vscode.postMessage({
                            command: 'exportLibrary',
                            format: 'json'
                        });
                    }

                    function showImportDialog() {
                        const format = confirm('Import JSON? (Click Cancel for SQL)') ? 'json' : 'sql';
                        const input = prompt(\`Paste your \${format.toUpperCase()} content here:\`);

                        if (input) {
                            vscode.postMessage({
                                command: 'importSnippets',
                                data: input,
                                format: format
                            });
                        }
                    }

                    function refreshView() {
                        location.reload();
                    }

                    // Handle messages from extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.command) {
                            case 'searchResults':
                                updateSnippetsGrid(message.snippets);
                                break;
                            case 'snippetCreated':
                                hideCreateForm();
                                location.reload();
                                break;
                        }
                    });

                    function updateSnippetsGrid(snippets) {
                        const grid = document.getElementById('snippetsGrid');
                        // Update grid with search results
                        console.log('Updating grid with', snippets.length, 'snippets');
                    }
                </script>
            </body>
            </html>
        `;
    }

    dispose(): void {
        if (this.webviewPanel) {
            this.webviewPanel.dispose();
        }
    }
}