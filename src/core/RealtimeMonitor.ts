import { Logger } from '../utils/Logger';
import { EventEmitter } from 'events';

export interface MigrationProgress {
    migrationId: string;
    phase: string;
    message: string;
    percentage: number;
    currentStep?: number;
    totalSteps?: number;
    timestamp: Date;
    details?: Record<string, any>;
}

export interface RealtimeSubscription {
    id: string;
    migrationId?: string;
    callback: (progress: MigrationProgress) => void;
    filter?: (progress: MigrationProgress) => boolean;
}

export class RealtimeMonitor extends EventEmitter {
    private subscriptions: Map<string, RealtimeSubscription> = new Map();
    private progressHistory: Map<string, MigrationProgress[]> = new Map();
    private activeMigrations: Set<string> = new Set();

    constructor() {
        super();
        this.setMaxListeners(100); // Allow more listeners for real-time updates
    }

    subscribe(subscription: Omit<RealtimeSubscription, 'id'>): string {
        const id = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const fullSubscription: RealtimeSubscription = { id, ...subscription };

        this.subscriptions.set(id, fullSubscription);

        Logger.info('Realtime subscription added', 'RealtimeMonitor.subscribe', {
            subscriptionId: id,
            migrationId: subscription.migrationId
        });

        return id;
    }

    unsubscribe(subscriptionId: string): boolean {
        const removed = this.subscriptions.delete(subscriptionId);
        if (removed) {
            Logger.info('Realtime subscription removed', 'RealtimeMonitor.unsubscribe', { subscriptionId });
        }
        return removed;
    }

    publishProgress(progress: MigrationProgress): void {
        // Store in history
        if (!this.progressHistory.has(progress.migrationId)) {
            this.progressHistory.set(progress.migrationId, []);
        }
        this.progressHistory.get(progress.migrationId)!.push(progress);

        // Mark migration as active
        this.activeMigrations.add(progress.migrationId);

        // Notify subscribers
        for (const subscription of this.subscriptions.values()) {
            if (this.shouldNotifySubscription(subscription, progress)) {
                try {
                    subscription.callback(progress);
                } catch (error) {
                    Logger.error('Subscription callback failed', error as Error, 'RealtimeMonitor.publishProgress', {
                        subscriptionId: subscription.id,
                        migrationId: progress.migrationId
                    });
                }
            }
        }

        // Emit event for additional listeners
        this.emit('progress', progress);
        this.emit(`progress:${progress.migrationId}`, progress);

        Logger.debug('Progress published', 'RealtimeMonitor.publishProgress', {
            migrationId: progress.migrationId,
            phase: progress.phase,
            percentage: progress.percentage
        });
    }

    private shouldNotifySubscription(subscription: RealtimeSubscription, progress: MigrationProgress): boolean {
        // Check migration ID filter
        if (subscription.migrationId && subscription.migrationId !== progress.migrationId) {
            return false;
        }

        // Check custom filter
        if (subscription.filter && !subscription.filter(progress)) {
            return false;
        }

        return true;
    }

    getProgressHistory(migrationId: string): MigrationProgress[] {
        return this.progressHistory.get(migrationId) || [];
    }

    getLatestProgress(migrationId: string): MigrationProgress | null {
        const history = this.progressHistory.get(migrationId);
        return history && history.length > 0 ? history[history.length - 1] : null;
    }

    getActiveMigrations(): string[] {
        return Array.from(this.activeMigrations);
    }

    markMigrationComplete(migrationId: string): void {
        this.activeMigrations.delete(migrationId);
        this.emit('migrationComplete', migrationId);

        Logger.info('Migration marked as complete', 'RealtimeMonitor.markMigrationComplete', { migrationId });
    }

    markMigrationFailed(migrationId: string, error: string): void {
        this.activeMigrations.delete(migrationId);
        this.emit('migrationFailed', { migrationId, error });

        Logger.info('Migration marked as failed', 'RealtimeMonitor.markMigrationFailed', { migrationId });
    }

    // WebSocket/SSE support methods
    createWebSocketHandler(): any {
        // In a real implementation, this would return a WebSocket handler
        // For now, return a mock that can be extended
        return {
            onConnection: (ws: any) => {
                const subscriptionId = this.subscribe({
                    callback: (progress) => {
                        ws.send(JSON.stringify({
                            type: 'progress',
                            data: progress
                        }));
                    }
                });

                ws.on('close', () => {
                    this.unsubscribe(subscriptionId);
                });
            }
        };
    }

    // Polling support
    getProgressUpdates(since?: Date, migrationId?: string): MigrationProgress[] {
        const updates: MigrationProgress[] = [];

        for (const [mid, history] of this.progressHistory) {
            if (migrationId && mid !== migrationId) continue;

            for (const progress of history) {
                if (!since || progress.timestamp > since) {
                    updates.push(progress);
                }
            }
        }

        return updates.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }

    // Cleanup old history
    cleanup(maxAgeMs: number = 24 * 60 * 60 * 1000): void { // 24 hours default
        const cutoff = new Date(Date.now() - maxAgeMs);
        const toRemove: string[] = [];

        for (const [migrationId, history] of this.progressHistory) {
            // Remove old entries from history
            const filtered = history.filter(p => p.timestamp > cutoff);
            if (filtered.length === 0) {
                toRemove.push(migrationId);
            } else {
                this.progressHistory.set(migrationId, filtered);
            }
        }

        // Remove empty histories
        for (const migrationId of toRemove) {
            this.progressHistory.delete(migrationId);
        }

        Logger.info('Realtime monitor cleanup completed', 'RealtimeMonitor.cleanup', {
            removedMigrations: toRemove.length,
            remainingMigrations: this.progressHistory.size
        });
    }

    getStats(): {
        activeSubscriptions: number;
        activeMigrations: number;
        totalProgressHistory: number;
        oldestProgress?: Date;
        newestProgress?: Date;
    } {
        let oldest: Date | undefined;
        let newest: Date | undefined;

        for (const history of this.progressHistory.values()) {
            for (const progress of history) {
                if (!oldest || progress.timestamp < oldest) oldest = progress.timestamp;
                if (!newest || progress.timestamp > newest) newest = progress.timestamp;
            }
        }

        return {
            activeSubscriptions: this.subscriptions.size,
            activeMigrations: this.activeMigrations.size,
            totalProgressHistory: Array.from(this.progressHistory.values()).reduce((sum, h) => sum + h.length, 0),
            oldestProgress: oldest,
            newestProgress: newest
        };
    }
}