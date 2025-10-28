import * as vscode from 'vscode';
import { Logger } from '@/utils/Logger';
import {
    DetailedSchemaComparisonResult,
    SchemaDifference
} from '@/managers/schema/SchemaComparison';

export interface ComparisonHistoryEntry {
    id: string;
    sourceConnectionId: string;
    targetConnectionId: string;
    sourceName: string;
    targetName: string;
    differenceCount: number;
    createdAt: string;
    executionTime: number;
    comparisonMode: 'strict' | 'lenient';
    objectCounts: {
        source: number;
        target: number;
    };
    differenceSummary: Record<string, number>;
    highlights: string[];
}

export interface SanitizedDifference {
    type: SchemaDifference['type'];
    objectType: string;
    objectName: string;
    schema: string;
    differenceDetails: string[];
}

interface ComparisonMetadata {
    sourceConnectionId: string;
    targetConnectionId: string;
    sourceName: string;
    targetName: string;
}

const HISTORY_KEY = 'postgresql.reporting.comparisonHistory';
const DETAIL_PREFIX = 'postgresql.reporting.comparisonDetails.';
const MAX_HISTORY_ENTRIES = 20;
const MAX_DETAILS_PER_ENTRY = 150;
const MAX_HIGHLIGHTS = 5;

export class ReportingService {
    constructor(private readonly context: vscode.ExtensionContext) { }

    async recordComparison(
        result: DetailedSchemaComparisonResult,
        metadata: ComparisonMetadata
    ): Promise<ComparisonHistoryEntry> {
        try {
            const history = await this.getComparisonHistory();

            const sanitizedDifferences = this.sanitizeDifferences(result.differences);
            const differenceSummary = this.summariseDifferences(sanitizedDifferences);
            const highlights = this.buildHighlights(sanitizedDifferences, differenceSummary);

            const entry: ComparisonHistoryEntry = {
                id: result.comparisonId,
                sourceConnectionId: metadata.sourceConnectionId,
                targetConnectionId: metadata.targetConnectionId,
                sourceName: metadata.sourceName,
                targetName: metadata.targetName,
                differenceCount: sanitizedDifferences.length,
                createdAt: result.createdAt instanceof Date
                    ? result.createdAt.toISOString()
                    : new Date(result.createdAt).toISOString(),
                executionTime: result.executionTime,
                comparisonMode: result.comparisonMode,
                objectCounts: {
                    source: result.sourceObjectCount,
                    target: result.targetObjectCount
                },
                differenceSummary,
                highlights
            };

            const updatedHistory = [entry, ...history]
                .slice(0, MAX_HISTORY_ENTRIES);

            await this.context.globalState.update(HISTORY_KEY, updatedHistory);
            await this.context.globalState.update(
                `${DETAIL_PREFIX}${entry.id}`,
                sanitizedDifferences
            );

            Logger.info('Recorded schema comparison entry', 'ReportingService.recordComparison', {
                comparisonId: entry.id,
                differenceCount: entry.differenceCount
            });

            return entry;
        } catch (error) {
            Logger.error('Failed to record schema comparison', error as Error, 'ReportingService.recordComparison');
            throw error;
        }
    }

    async getComparisonHistory(): Promise<ComparisonHistoryEntry[]> {
        const history = this.context.globalState.get<ComparisonHistoryEntry[]>(HISTORY_KEY, []);
        if (!Array.isArray(history)) {
            return [];
        }
        return history;
    }

    async getComparisonDetails(comparisonId: string): Promise<SanitizedDifference[]> {
        const details = this.context.globalState.get<SanitizedDifference[]>(`${DETAIL_PREFIX}${comparisonId}`, []);
        if (!Array.isArray(details)) {
            return [];
        }
        return details;
    }

    async clearComparisonHistory(): Promise<void> {
        const history = await this.getComparisonHistory();

        await this.context.globalState.update(HISTORY_KEY, []);
        await Promise.all(history.map(entry =>
            this.context.globalState.update(`${DETAIL_PREFIX}${entry.id}`, undefined)
        ));

        Logger.info('Cleared schema comparison history', 'ReportingService.clearComparisonHistory');
    }

    private sanitiseDetailText(text: string): string {
        return text.length > 500 ? `${text.slice(0, 497)}...` : text;
    }

    private sanitiseDifference(diff: SchemaDifference): SanitizedDifference {
        return {
            type: diff.type,
            objectType: diff.objectType,
            objectName: diff.objectName,
            schema: diff.schema,
            differenceDetails: (diff.differenceDetails || [])
                .slice(0, 5)
                .map(detail => this.sanitiseDetailText(detail))
        };
    }

    private sanitizeDifferences(differences: SchemaDifference[]): SanitizedDifference[] {
        const sanitised = differences
            .slice(0, MAX_DETAILS_PER_ENTRY)
            .map(diff => this.sanitiseDifference(diff));

        return sanitised;
    }

    private summariseDifferences(differences: SanitizedDifference[]): Record<string, number> {
        return differences.reduce<Record<string, number>>((summary, diff) => {
            const key = diff.type.toLowerCase();
            summary[key] = (summary[key] || 0) + 1;
            return summary;
        }, {});
    }

    private buildHighlights(
        differences: SanitizedDifference[],
        summary: Record<string, number>
    ): string[] {
        const highlights: string[] = [];

        const addedCount = summary.added || 0;
        const removedCount = summary.removed || 0;
        const modifiedCount = summary.modified || 0;

        if (addedCount > 0) {
            highlights.push(`${addedCount} object${addedCount === 1 ? '' : 's'} added in target`);
        }
        if (removedCount > 0) {
            highlights.push(`${removedCount} object${removedCount === 1 ? '' : 's'} missing from target`);
        }
        if (modifiedCount > 0) {
            highlights.push(`${modifiedCount} object${modifiedCount === 1 ? '' : 's'} modified across environments`);
        }

        if (highlights.length === 0 && differences.length > 0) {
            highlights.push('Differences detected across compared environments');
        }

        const notableDifferences = differences
            .filter(diff => diff.differenceDetails.length > 0)
            .slice(0, Math.max(0, MAX_HIGHLIGHTS - highlights.length))
            .map(diff => `${diff.objectType} ${diff.schema}.${diff.objectName}`);

        highlights.push(...notableDifferences);

        return highlights.slice(0, MAX_HIGHLIGHTS);
    }
}
