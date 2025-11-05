# PostgreSQL Schema Sync - React Views

This directory contains the modern React-based user interface components for the PostgreSQL Schema Sync VS Code extension.

## 📁 Directory Structure

```
src/views/
├── components/           # Reusable React components
│   ├── database/        # Database-specific components
│   ├── forms/          # Form components and inputs
│   ├── layout/         # Layout and container components
│   ├── operations/     # Operation monitoring components
│   └── shared/         # Shared/common components
├── hooks/              # Custom React hooks
├── legacy/             # Legacy TypeScript view classes (to be migrated)
├── pages/              # Main page/view components
├── styles/             # CSS styles and design system
├── templates/          # HTML templates for webpack bundling
├── theme/              # VS Code theme integration
├── types/              # TypeScript type definitions
└── utils/              # Utility functions and helpers
```

## 🚀 Quick Start

### Building Views
```bash
pnpm run build:views
```

### Development
```bash
pnpm run build:views -- --mode=development --watch
```

## 📦 Components

### Shared Components
- **Button** - Reusable button with variants and states
- **Panel** - Layout container with collapsible functionality

### Database Components
- **ConnectionStatus** - Real-time database connection monitoring

### Operations Components
- **OperationMonitor** - Operation progress tracking and history

## 🎣 Custom Hooks

### Database Hooks
- **useDatabaseConnections** - Connection management with real-time updates
- **useOperations** - Operation monitoring and lifecycle management

## 🎨 Theming

The views integrate seamlessly with VS Code's theming system using CSS custom properties. The theme is defined in `theme/vscode-theme.ts` and provides consistent styling across all components.

## 🔧 Build System

- **Webpack** - Bundles React components for each view
- **Code Splitting** - Separate bundles for each page to optimize loading
- **TypeScript** - Full type safety and modern JavaScript features
- **CSS Modules** - Scoped styling with VS Code theme integration

## 📋 Migration Status

### ✅ Completed
- Dashboard View - Real-time monitoring dashboard
- Schema Browser - Interactive schema tree with search
- Migration Wizard - Step-by-step migration creation
- Query Editor - Advanced SQL editor with history
- Settings View - Comprehensive settings management

### 🔄 Legacy Views (To Be Migrated)
- ConnectionManagementView.ts
- DashboardView.ts
- DriftReportView.ts
- ErrorDisplayView.ts
- ImportWizardView.ts
- MigrationPreviewView.ts
- NotificationManager.ts
- QueryAnalyticsView.ts
- QueryEditorView.ts
- SchemaBrowserView.ts
- SchemaComparisonView.ts
- SettingsView.ts

## 🔌 VS Code Integration

Views communicate with the extension backend through the VS Code messaging API:

```typescript
// Send message to extension
vscode.postMessage({ command: 'getConnections' });

// Listen for responses
window.addEventListener('message', (event) => {
  const message = event.data;
  // Handle response
});
```

## 📊 Bundle Analysis

Current bundle sizes (production build):
- Dashboard: 356 bytes
- Schema Browser: 2.7 KiB
- Migration Wizard: 2.7 KiB
- Query Editor: 2.7 KiB
- Settings: 2.7 KiB

Total: ~6.36 KiB (minified + gzipped)

## 🎯 Best Practices

### Component Development
- Use TypeScript for all components
- Follow React functional component patterns
- Implement proper error boundaries
- Use custom hooks for data management
- Ensure accessibility compliance

### Styling
- Use VS Code theme variables for consistency
- Implement responsive design
- Support both light and dark themes
- Use CSS custom properties for theming

### Performance
- Implement code splitting for large components
- Use React.memo for expensive re-renders
- Optimize bundle sizes
- Implement proper loading states

## 🧪 Testing

```bash
# Run tests (when implemented)
pnpm test:views
```

## 📚 Documentation

- [VS Code Extension API](https://code.visualstudio.com/api)
- [React Documentation](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)