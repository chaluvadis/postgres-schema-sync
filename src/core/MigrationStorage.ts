import * as fs from 'fs';
import * as path from 'path';
import { MigrationRequest, MigrationResult } from './MigrationOrchestrator';

export class MigrationStorage {
    private storagePath: string;

    constructor(storagePath: string) {
        this.storagePath = storagePath;
        this.ensureStorageExists();
    }

    private ensureStorageExists(): void {
        const dir = path.dirname(this.storagePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (!fs.existsSync(this.storagePath)) {
            fs.writeFileSync(this.storagePath, JSON.stringify({ activeMigrations: {}, migrationResults: {} }, null, 2));
        }
    }

    async loadData(): Promise<{ activeMigrations: Record<string, MigrationRequest>; migrationResults: Record<string, MigrationResult> }> {
        try {
            const data = fs.readFileSync(this.storagePath, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Failed to load migration storage:', error);
            return { activeMigrations: {}, migrationResults: {} };
        }
    }

    async saveData(data: { activeMigrations: Record<string, MigrationRequest>; migrationResults: Record<string, MigrationResult> }): Promise<void> {
        try {
            fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Failed to save migration storage:', error);
        }
    }

    async getActiveMigrations(): Promise<Map<string, MigrationRequest>> {
        const data = await this.loadData();
        return new Map(Object.entries(data.activeMigrations));
    }

    async setActiveMigrations(migrations: Map<string, MigrationRequest>): Promise<void> {
        const data = await this.loadData();
        data.activeMigrations = Object.fromEntries(migrations);
        await this.saveData(data);
    }

    async getMigrationResults(): Promise<Map<string, MigrationResult>> {
        const data = await this.loadData();
        return new Map(Object.entries(data.migrationResults));
    }

    async setMigrationResults(results: Map<string, MigrationResult>): Promise<void> {
        const data = await this.loadData();
        data.migrationResults = Object.fromEntries(results);
        await this.saveData(data);
    }

    async addActiveMigration(id: string, request: MigrationRequest): Promise<void> {
        const migrations = await this.getActiveMigrations();
        migrations.set(id, request);
        await this.setActiveMigrations(migrations);
    }

    async removeActiveMigration(id: string): Promise<void> {
        const migrations = await this.getActiveMigrations();
        migrations.delete(id);
        await this.setActiveMigrations(migrations);
    }

    async addMigrationResult(id: string, result: MigrationResult): Promise<void> {
        const results = await this.getMigrationResults();
        results.set(id, result);
        await this.setMigrationResults(results);
    }

    async clear(): Promise<void> {
        await this.saveData({ activeMigrations: {}, migrationResults: {} });
    }
}