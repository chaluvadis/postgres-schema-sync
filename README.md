# VSCode Extension: PostgreSQL Schema Compare & Sync

## Overview

This extension allows you to connect to both your local and production PostgreSQL databases, visually compare their schemas, and safely synchronize changes from development to production. It features a database explorer treeview, detailed schema diffing, change preview, safe migration execution, and rollback support.

---

## Features

- **Database Connections:** Add, test, and manage multiple connections (local, production, staging, etc.).
- **Explorer Treeview:** Visualize all database objects (tables, views, functions, procedures, sequences, types, schemas) in a hierarchical, searchable tree.
- **Schema Comparison:** Compare full schemas or selected objects; view detailed, color-coded diffs.
- **Migration & Sync:** Select changes, preview migration SQL, execute safely with dry-run and rollback options.
- **Object Details:** View columns, constraints, indexes, source code, sample data, and more for any DB object.
- **Settings & Customization:** Ignore lists, strict/lenient comparison, notification preferences.
- **Help & Support:** FAQs, troubleshooting, easy feedback/reporting.

---

## Architecture Diagram

### ASCII Diagram

```
+----------------------------+
|   VSCode Extension UI      |
|  (Webview, Treeview)       |
+-------------+--------------+
              |
              |           
+-------------V---------------+
|  Extension Backend (Node.js)|
|  - Controller/Coordinator   |
|  - Schema Compare Module    |
|  - Migration Generator      |
+-------------+---------------+
              |
+--+----------V--------+------+
   |                   |
   v                   v
+------------+     +----------------+
|   Local    |     |   Production   |
| Postgres   |     |   Postgres     |
+------------+     +----------------+
```

```
flowchart TD
    subgraph VSCode Extension
        UI[UI Webview Panel]
        Tree[Database Explorer Treeview]
        Cmd[Command Palette]
        UI --> Backend
        Tree --> Backend
        Cmd --> Backend
    end
    subgraph Extension Backend (Node.js)
        Backend[Controller/Coordinator]
        Compare[Schema Comparison Module]
        Migrate[Migration Generator]
        Backend --> Compare
        Backend --> Migrate
    end
    subgraph Databases
        Local[Local PostgreSQL]
        Prod[Production PostgreSQL]
    end
    Compare -- Fetches Metadata --> Local
    Compare -- Fetches Metadata --> Prod
    Migrate -- Generates SQL --> Prod
```

---

## Detailed Workflow

1. **Connect to Local & Production Databases**  
   - Securely add and test connections using the VSCode UI.
2. **Explore Database Objects**  
   - Use the treeview to browse tables, views, functions, procedures, etc.  
   - Click any object for detailed schema info and sample data.
3. **Compare Schemas**  
   - Select whole DB or specific objects for comparison.  
   - View color-coded visual diff showing adds, deletes, changes.
4. **Sync Changes**  
   - Choose which changes to sync from local to production.  
   - Preview generated SQL migration.  
   - Dry-run available to simulate changes.  
   - Confirm before executing on production DB.
5. **View Logs & Rollback**  
   - Success/failure logs for every migration.  
   - Rollback SQL generated for safe recovery.
6. **Customize & Get Help**  
   - Manage ignore lists, comparison strictness, notification settings.  
   - Access help, troubleshooting, and submit feedback via the extension.

---

## Security

- Connection credentials are stored securely using VSCode Secret Storage.
- All destructive actions (e.g., DROP TABLE) require explicit confirmation.
- Migration logs and rollback scripts provide safety and auditability.

---

## Getting Started

1. Install the extension from the VSCode Marketplace.
2. Open the command palette and run `Postgres: Add Connection` to set up your databases.
3. Use the "Postgres Explorer" view to browse objects.
4. Run `Postgres: Compare Schemas` to start a comparison.
5. Review differences, select changes, and sync safely!
