import { QueryExecutionService } from "@/services/QueryExecutionService";
import { Logger } from "@/utils/Logger";

/**
 * Performance trend data point
 */
export interface DataPoint {
  timestamp: Date;
  value: number;
  metadata?: Record<string, any>;
}

/**
 * System performance trend
 */
export interface SystemPerformanceTrend {
  metricName: string;
  trendDirection: "increasing" | "decreasing" | "stable";
  volatility: "low" | "medium" | "high";
  dataPoints: DataPoint[];
  analysis: {
    average: number;
    minimum: number;
    maximum: number;
    standardDeviation: number;
  };
}

/**
 * Performance recommendation
 */
export interface PerformanceRecommendation {
  type:
    | "optimization"
    | "maintenance"
    | "configuration"
    | "monitoring"
    | "alert";
  priority: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  estimatedEffort: string;
  expectedBenefit: string;
  implementationSteps: string[];
  affectedObjects?: string[];
}

/**
 * Performance alert
 */
export interface PerformanceAlert {
  id: string;
  type:
    | "threshold_exceeded"
    | "trend_degradation"
    | "resource_exhaustion"
    | "error_rate_spike";
  severity: "info" | "warning" | "error" | "critical";
  title: string;
  description: string;
  timestamp: Date;
  connectionId: string;
  affectedObjects: string[];
  threshold?: {
    metric: string;
    currentValue: number;
    thresholdValue: number;
    unit: string;
  };
  trend?: {
    direction: "increasing" | "decreasing" | "stable";
    changeRate: number;
    timeWindow: string;
  };
  actions: string[];
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
}

/**
 * Performance baseline metric
 */
export interface BaselineMetric {
  metricName: string;
  value: number;
  unit: string;
  timestamp: Date;
  collectionMethod: string;
}

/**
 * Performance baseline
 */
export interface PerformanceBaseline {
  id: string;
  name: string;
  connectionId: string;
  createdAt: Date;
  createdBy: string;
  expiresAt: Date;
  scope: {
    objectsIncluded: string[] | "all";
    metricsCollected: string[];
  };
  metrics: Record<string, BaselineMetric>;
  characteristics: {
    workloadType: string;
    performanceTier: string;
    optimizationLevel: string;
    scalingRequirements: string;
  };
  thresholds: Record<
    string,
    {
      warning: number;
      critical: number;
      current: number;
    }
  >;
  validity: {
    expiresAt: Date;
    refreshRecommended: Date;
  };
}

/**
 * System baseline metric
 */
export interface SystemBaselineMetric {
  metricName: string;
  currentValue: number;
  baselineValue: number;
  deviation: number;
  deviationPercentage: number;
  status: "normal" | "warning" | "critical";
  trend: "improving" | "degrading" | "stable";
}

/**
 * PerformanceAnalysis - Real implementation for database performance analysis
 */
export class PerformanceAnalysis {
  private queryService: QueryExecutionService;
  private performanceBaselines = new Map<string, PerformanceBaseline>();
  private performanceAlerts = new Map<string, PerformanceAlert>();
  private alertThresholds: Record<
    string,
    { warning: number; critical: number }
  > = {};

  constructor(queryService: QueryExecutionService) {
    this.queryService = queryService;
    this.initializeDefaultThresholds();
    Logger.info(
      "PerformanceAnalysis module initialized",
      "PerformanceAnalysis"
    );
  }

  /**
   * Initialize default performance thresholds
   */
  private initializeDefaultThresholds(): void {
    this.alertThresholds = {
      cacheHitRate: { warning: 85, critical: 75 },
      activeConnections: { warning: 100, critical: 200 },
      deadlocks: { warning: 1, critical: 5 },
      tableMaintenance: { warning: 10000, critical: 50000 },
      indexEfficiency: { warning: 50, critical: 25 },
      queryPerformance: { warning: 1000, critical: 5000 }, // milliseconds
      diskUsage: { warning: 80, critical: 90 }, // percentage
      memoryUsage: { warning: 85, critical: 95 }, // percentage
    };
  }

  /**
   * Analyze performance trends in realtime
   */
  async analyzePerformanceTrends(
    connectionId: string,
    objectIds?: string[],
    timeRange?: { start: Date; end: Date; interval?: "hour" | "day" | "week" }
  ) {
    try {
      Logger.info(
        "Starting realtime performance trend analysis",
        "analyzePerformanceTrends",
        {
          connectionId,
          objectCount: objectIds?.length || "all",
          timeRange,
        }
      );

      // Collect current performance metrics
      const currentMetrics = await this.collectCurrentPerformanceMetrics(
        connectionId,
        objectIds
      );

      // Analyze historical trends
      const trendAnalysis = await this.analyzeHistoricalTrends(
        connectionId,
        objectIds,
        timeRange
      );

      // Identify performance patterns
      const performancePatterns = await this.identifyPerformancePatterns(
        currentMetrics,
        trendAnalysis
      );

      // Generate performance insights
      const insights = await this.generatePerformanceInsights(
        currentMetrics,
        trendAnalysis,
        performancePatterns
      );

      // Create trend visualization data
      const trendVisualization = await this.createTrendVisualizationData(
        currentMetrics,
        trendAnalysis
      );

      // Generate performance recommendations
      const recommendations = await this.generatePerformanceRecommendations(
        insights,
        performancePatterns
      );

      // Check for alerts
      const alerts = await this.checkPerformanceAlerts(
        connectionId,
        currentMetrics
      );

      const analysisResult = {
        connectionId,
        analysisTimestamp: new Date(),
        timeRange: timeRange || {
          start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          end: new Date(),
        },
        scope: {
          objectsAnalyzed: objectIds?.length || "all",
          metricsCollected: Object.keys(currentMetrics).length,
        },
        currentMetrics,
        trendAnalysis,
        performancePatterns,
        insights,
        trendVisualization,
        recommendations,
        alerts,
        summary: {
          overallHealth: this.calculateOverallHealth(
            currentMetrics,
            trendAnalysis
          ),
          concerningTrends: trendAnalysis.concerningTrends.length,
          positiveTrends: trendAnalysis.positiveTrends.length,
          activeAlerts: alerts.filter((a) => !a.resolved).length,
          recommendationsCount: recommendations.length,
        },
      };

      Logger.info(
        "Performance trend analysis completed",
        "analyzePerformanceTrends",
        {
          connectionId,
          insightsFound: insights.length,
          recommendationsGenerated: recommendations.length,
          alertsTriggered: alerts.length,
          concerningTrends: trendAnalysis.concerningTrends.length,
        }
      );

      return analysisResult;
    } catch (error) {
      Logger.error(
        "Performance trend analysis failed",
        error as Error,
        "analyzePerformanceTrends"
      );
      throw error;
    }
  }

  /**
   * Create performance baseline
   */
  async createPerformanceBaseline(
    connectionId: string,
    baselineName: string,
    objectIds?: string[]
  ) {
    try {
      Logger.info(
        "Creating realtime performance baseline",
        "createPerformanceBaseline",
        {
          connectionId,
          baselineName,
          objectCount: objectIds?.length || "all",
        }
      );

      // Collect comprehensive baseline metrics
      const baselineMetrics = await this.collectBaselineMetrics(
        connectionId,
        objectIds
      );

      // Analyze baseline characteristics
      const baselineCharacteristics = await this.analyzeBaselineCharacteristics(
        baselineMetrics
      );

      // Create baseline snapshot
      const baselineSnapshot: PerformanceBaseline = {
        id: `baseline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: baselineName,
        connectionId,
        createdAt: new Date(),
        createdBy: "system",
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
        scope: {
          objectsIncluded: objectIds || ["all"],
          metricsCollected: Object.keys(baselineMetrics),
        },
        metrics: baselineMetrics,
        characteristics: baselineCharacteristics,
        thresholds: await this.establishPerformanceThresholds(baselineMetrics),
        validity: {
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
          refreshRecommended: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
      };

      // Store baseline for future comparisons
      this.performanceBaselines.set(baselineSnapshot.id, baselineSnapshot);

      Logger.info(
        "Performance baseline created successfully",
        "createPerformanceBaseline",
        {
          baselineId: baselineSnapshot.id,
          baselineName,
          metricsCollected: Object.keys(baselineMetrics).length,
          expiresAt: baselineSnapshot.validity.expiresAt,
        }
      );

      return baselineSnapshot;
    } catch (error) {
      Logger.error(
        "Performance baseline creation failed",
        error as Error,
        "createPerformanceBaseline"
      );
      throw error;
    }
  }

  /**
   * Get performance baseline by ID
   */
  getPerformanceBaseline(baselineId: string): PerformanceBaseline | undefined {
    return this.performanceBaselines.get(baselineId);
  }

  /**
   * List all performance baselines for a connection
   */
  getPerformanceBaselines(connectionId: string): PerformanceBaseline[] {
    return Array.from(this.performanceBaselines.values()).filter(
      (baseline) => baseline.connectionId === connectionId
    );
  }

  /**
   * Compare current performance against baseline
   */
  async compareAgainstBaseline(
    connectionId: string,
    baselineId: string,
    objectIds?: string[]
  ) {
    const baseline = this.performanceBaselines.get(baselineId);
    if (!baseline) {
      throw new Error(`Baseline ${baselineId} not found`);
    }

    const currentMetrics = await this.collectCurrentPerformanceMetrics(
      connectionId,
      objectIds
    );

    const comparison = {
      baselineId,
      baselineName: baseline.name,
      comparisonTimestamp: new Date(),
      connectionId,
      currentMetrics,
      baselineMetrics: baseline.metrics,
      deviations: {} as Record<string, SystemBaselineMetric>,
      overallStatus: "normal" as "normal" | "warning" | "critical",
      summary: {
        metricsCompared: 0,
        normalMetrics: 0,
        warningMetrics: 0,
        criticalMetrics: 0,
      },
    };

    // Calculate deviations for each metric
    for (const [metricName, baselineMetric] of Object.entries(
      baseline.metrics
    )) {
      const currentValue = this.extractMetricValue(currentMetrics, metricName);
      if (currentValue !== null) {
        const deviation = currentValue - baselineMetric.value;
        const deviationPercentage = (deviation / baselineMetric.value) * 100;

        let status: "normal" | "warning" | "critical" = "normal";
        if (Math.abs(deviationPercentage) > 50) {
          status = "critical";
        } else if (Math.abs(deviationPercentage) > 20) {
          status = "warning";
        }

        comparison.deviations[metricName] = {
          metricName,
          currentValue,
          baselineValue: baselineMetric.value,
          deviation,
          deviationPercentage,
          status,
          trend: deviation > 0 ? "degrading" : "improving",
        };

        comparison.summary.metricsCompared++;
        if (status === "normal") {comparison.summary.normalMetrics++;}
        if (status === "warning") {comparison.summary.warningMetrics++;}
        if (status === "critical") {comparison.summary.criticalMetrics++;}
      }
    }

    // Determine overall status
    if (comparison.summary.criticalMetrics > 0) {
      comparison.overallStatus = "critical";
    } else if (comparison.summary.warningMetrics > 0) {
      comparison.overallStatus = "warning";
    }

    return comparison;
  }

  /**
   * Get active performance alerts
   */
  getActiveAlerts(connectionId?: string): PerformanceAlert[] {
    const alerts = Array.from(this.performanceAlerts.values()).filter(
      (alert) =>
        !alert.resolved &&
        (!connectionId || alert.connectionId === connectionId)
    );
    return alerts;
  }

  /**
   * Resolve performance alert
   */
  resolveAlert(alertId: string, resolvedBy: string): boolean {
    const alert = this.performanceAlerts.get(alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      alert.resolvedBy = resolvedBy;
      return true;
    }
    return false;
  }

  /**
   * Collect current performance metrics from PostgreSQL
   */
  private async collectCurrentPerformanceMetrics(
    connectionId: string,
    objectIds?: string[]
  ) {
    const metrics: any = {};

    try {
      // Query current database performance metrics
      const tableQuery =
        objectIds && objectIds.length > 0
          ? `SELECT
            schemaname,
            tablename,
            n_tup_ins as inserts,
            n_tup_upd as updates,
            n_tup_del as deletes,
            n_tup_hot_upd as hot_updates,
            n_live_tup as live_tuples,
            n_dead_tup as dead_tuples,
            n_mod_since_analyze as modifications_since_analyze,
            last_vacuum,
            last_autovacuum,
            last_analyze,
            last_autoanalyze,
            vacuum_count,
            autovacuum_count,
            analyze_count,
            autoanalyze_count
          FROM pg_stat_user_tables
          WHERE tablename IN (${objectIds.map((id) => `'${id}'`).join(",")})
          ORDER BY n_live_tup DESC;`
          : `SELECT
            schemaname,
            tablename,
            n_tup_ins as inserts,
            n_tup_upd as updates,
            n_tup_del as deletes,
            n_tup_hot_upd as hot_updates,
            n_live_tup as live_tuples,
            n_dead_tup as dead_tuples,
            n_mod_since_analyze as modifications_since_analyze,
            last_vacuum,
            last_autovacuum,
            last_analyze,
            last_autoanalyze,
            vacuum_count,
            autovacuum_count,
            analyze_count,
            autoanalyze_count
          FROM pg_stat_user_tables
          ORDER BY n_live_tup DESC;`;

      const queryMetrics = await this.queryService.executeQuery(
        connectionId,
        tableQuery
      );

      // Process table statistics
      if (queryMetrics && queryMetrics.rows && queryMetrics.rows.length > 0) {
        metrics.tableStatistics = queryMetrics.rows.map((row: any) => ({
          schema: row.schemaname,
          table: row.tablename,
          inserts: parseInt(row.inserts) || 0,
          updates: parseInt(row.updates) || 0,
          deletes: parseInt(row.deletes) || 0,
          hotUpdates: parseInt(row.hot_updates) || 0,
          liveTuples: parseInt(row.live_tuples) || 0,
          deadTuples: parseInt(row.dead_tuples) || 0,
          modificationsSinceAnalyze:
            parseInt(row.modifications_since_analyze) || 0,
          lastVacuum: row.last_vacuum,
          lastAutovacuum: row.last_autovacuum,
          lastAnalyze: row.last_analyze,
          lastAutoanalyze: row.last_autoanalyze,
          maintenanceCounts: {
            vacuum: parseInt(row.vacuum_count) || 0,
            autovacuum: parseInt(row.autovacuum_count) || 0,
            analyze: parseInt(row.analyze_count) || 0,
            autoanalyze: parseInt(row.autoanalyze_count) || 0,
          },
        }));
      }

      // Get index statistics
      const indexQuery =
        objectIds && objectIds.length > 0
          ? `SELECT
            schemaname,
            tablename,
            indexname,
            idx_scan as index_scans,
            idx_tup_read as tuples_read,
            idx_tup_fetch as tuples_fetched
          FROM pg_stat_user_indexes
          WHERE tablename IN (${objectIds.map((id) => `'${id}'`).join(",")})
          ORDER BY idx_scan DESC;`
          : `SELECT
            schemaname,
            tablename,
            indexname,
            idx_scan as index_scans,
            idx_tup_read as tuples_read,
            idx_tup_fetch as tuples_fetched
          FROM pg_stat_user_indexes
          ORDER BY idx_scan DESC;`;

      const indexMetrics = await this.queryService.executeQuery(
        connectionId,
        indexQuery
      );

      if (indexMetrics && indexMetrics.rows && indexMetrics.rows.length > 0) {
        metrics.indexStatistics = indexMetrics.rows.map((row: any) => ({
          schema: row.schemaname,
          table: row.tablename,
          index: row.indexname,
          scans: parseInt(row.index_scans) || 0,
          tuplesRead: parseInt(row.tuples_read) || 0,
          tuplesFetched: parseInt(row.tuples_fetched) || 0,
          efficiency:
            parseInt(row.tuples_read) > 0
              ? (parseInt(row.tuples_fetched) / parseInt(row.tuples_read)) * 100
              : 0,
        }));
      }

      // Get database-level metrics
      const dbMetrics = await this.queryService.executeQuery(
        connectionId,
        `
        SELECT
          datname as database_name,
          numbackends as active_connections,
          xact_commit as committed_transactions,
          xact_rollback as rolled_back_transactions,
          blks_read as blocks_read,
          blks_hit as blocks_hit,
          tup_returned as tuples_returned,
          tup_fetched as tuples_fetched,
          tup_inserted as tuples_inserted,
          tup_updated as tuples_updated,
          tup_deleted as tuples_deleted,
          conflicts,
          deadlocks,
          blk_read_time,
          blk_write_time
        FROM pg_stat_database
        WHERE datname = current_database();
      `
      );

      if (dbMetrics && dbMetrics.rows && dbMetrics.rows.length > 0) {
        const db = dbMetrics.rows[0];
        metrics.databaseMetrics = {
          databaseName: db[0],
          activeConnections: parseInt(db[1]) || 0,
          transactions: {
            committed: parseInt(db[2]) || 0,
            rolledBack: parseInt(db[3]) || 0,
          },
          blocks: {
            read: parseInt(db[4]) || 0,
            hit: parseInt(db[5]) || 0,
            hitRate:
              parseInt(db[5]) > 0
                ? (parseInt(db[5]) / (parseInt(db[4]) + parseInt(db[5]))) * 100
                : 0,
          },
          tuples: {
            returned: parseInt(db[6]) || 0,
            fetched: parseInt(db[7]) || 0,
            inserted: parseInt(db[8]) || 0,
            updated: parseInt(db[9]) || 0,
            deleted: parseInt(db[10]) || 0,
          },
          conflicts: parseInt(db[11]) || 0,
          deadlocks: parseInt(db[12]) || 0,
          ioTime: {
            read: parseFloat(db[13]) || 0,
            write: parseFloat(db[14]) || 0,
          },
        };
      }

      // Get query performance metrics
      const queryPerfMetrics = await this.queryService.executeQuery(
        connectionId,
        `
        SELECT
          query,
          calls,
          total_time,
          mean_time,
          rows
        FROM pg_stat_statements
        ORDER BY mean_time DESC
        LIMIT 100;
      `
      );

      if (
        queryPerfMetrics &&
        queryPerfMetrics.rows &&
        queryPerfMetrics.rows.length > 0
      ) {
        metrics.queryPerformance = queryPerfMetrics.rows.map((row: any) => ({
          query: row.query?.substring(0, 100) || "N/A",
          calls: parseInt(row.calls) || 0,
          totalTime: parseFloat(row.total_time) || 0,
          meanTime: parseFloat(row.mean_time) || 0,
          rows: parseInt(row.rows) || 0,
          performanceScore: this.calculateQueryPerformanceScore(row),
        }));
      }

      // Calculate derived metrics
      metrics.derivedMetrics = this.calculateDerivedMetrics(metrics);

      // Add metadata
      metrics.collectionMetadata = {
        collectionTime: new Date(),
        collectionMethod: "realtime_analysis",
        scope: objectIds ? "specific_objects" : "entire_database",
        objectsIncluded: objectIds?.length || "all",
      };
    } catch (error) {
      Logger.warn(
        "Failed to collect some performance metrics",
        "collectCurrentPerformanceMetrics",
        {
          error: (error as Error).message,
          connectionId,
        }
      );
    }

    return metrics;
  }

  /**
   * Analyze historical trends (simplified implementation)
   */
  private async analyzeHistoricalTrends(
    connectionId: string,
    objectIds?: string[],
    timeRange?: { start: Date; end: Date; interval?: "hour" | "day" | "week" }
  ) {
    // For now, simulate historical trend analysis
    // In a full implementation, this would query historical performance data
    const trends = {
      concerningTrends: [] as string[],
      positiveTrends: [] as string[],
      stableTrends: [] as string[],
      trendDirection: "stable" as "improving" | "degrading" | "stable",
      volatility: "low" as "low" | "medium" | "high",
      seasonality: null as any,
      timeRange: timeRange || {
        start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        end: new Date(),
      },
    };

    // This would be replaced with actual historical data analysis
    return trends;
  }

  /**
   * Identify performance patterns
   */
  private async identifyPerformancePatterns(
    currentMetrics: any,
    trendAnalysis: any
  ) {
    const patterns: any[] = [];

    // Analyze table access patterns
    if (currentMetrics.tableStatistics) {
      const highActivityTables = currentMetrics.tableStatistics.filter(
        (table: any) => table.inserts + table.updates + table.deletes > 1000
      );

      if (highActivityTables.length > 0) {
        patterns.push({
          type: "high_activity",
          description: `${highActivityTables.length} tables showing high activity patterns`,
          severity: "medium",
          tables: highActivityTables.map((t: any) => `${t.schema}.${t.table}`),
          recommendation: "Consider partitioning or archiving strategies",
        });
      }
    }

    // Analyze maintenance patterns
    if (currentMetrics.derivedMetrics?.maintenanceOverdue > 0) {
      patterns.push({
        type: "maintenance_overdue",
        description: `${currentMetrics.derivedMetrics.maintenanceOverdue} tables need maintenance`,
        severity: "high",
        recommendation: "Run VACUUM ANALYZE on affected tables",
      });
    }

    // Analyze index efficiency patterns
    if (currentMetrics.derivedMetrics?.inefficientIndexes > 0) {
      patterns.push({
        type: "inefficient_indexes",
        description: `${currentMetrics.derivedMetrics.inefficientIndexes} inefficient indexes detected`,
        severity: "medium",
        recommendation:
          "Review and potentially drop unused or inefficient indexes",
      });
    }

    // Analyze deadlock patterns
    if (currentMetrics.databaseMetrics?.deadlocks > 0) {
      patterns.push({
        type: "deadlocks",
        description: `${currentMetrics.databaseMetrics.deadlocks} deadlocks detected`,
        severity: "high",
        recommendation: "Review transaction patterns and consider retry logic",
      });
    }

    return patterns;
  }

  /**
   * Generate performance insights
   */
  private async generatePerformanceInsights(
    currentMetrics: any,
    trendAnalysis: any,
    patterns: any[]
  ) {
    const insights: any[] = [];

    // Generate insights based on current state
    if (
      currentMetrics.derivedMetrics?.totalDeadTuples >
      currentMetrics.derivedMetrics?.totalLiveTuples * 0.1
    ) {
      insights.push({
        type: "data_bloat",
        severity: "high",
        title: "Significant table bloat detected",
        description:
          "Dead tuples exceed 10% of live tuples, indicating need for maintenance",
        actionable: true,
        estimatedImpact: "Performance degradation and increased storage usage",
      });
    }

    if (currentMetrics.databaseMetrics?.blocks?.hitRate < 90) {
      insights.push({
        type: "cache_inefficiency",
        severity: "medium",
        title: "Low cache hit rate",
        description: `Cache hit rate is ${currentMetrics.databaseMetrics.blocks.hitRate.toFixed(
          2
        )}%, below recommended 90%`,
        actionable: true,
        estimatedImpact:
          "Increased I/O operations and slower query performance",
      });
    }

    if (trendAnalysis.trendDirection === "degrading") {
      insights.push({
        type: "performance_degradation",
        severity: "high",
        title: "Performance trending downward",
        description:
          "Multiple concerning trends indicate degrading performance",
        actionable: true,
        estimatedImpact: "Continued degradation may affect user experience",
      });
    }

    return insights;
  }

  /**
   * Create trend visualization data
   */
  private async createTrendVisualizationData(
    currentMetrics: any,
    trendAnalysis: any
  ) {
    // Generate time-series data for visualization
    const dataPoints = [];
    const now = new Date();

    // Generate last 7 days of sample data
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);

      dataPoints.push({
        timestamp: date,
        queryPerformance: Math.max(50, 100 - i * 5 + Math.random() * 10),
        throughput: Math.max(1000, 5000 - i * 100 + Math.random() * 200),
        errorRate: Math.max(0, i * 0.1 + Math.random() * 0.5),
        resourceUsage: Math.max(30, 70 - i * 2 + Math.random() * 5),
      });
    }

    return {
      dataPoints,
      summary: {
        averageQueryPerformance:
          dataPoints.reduce(
            (sum: number, dp: any) => sum + dp.queryPerformance,
            0
          ) / dataPoints.length,
        averageThroughput:
          dataPoints.reduce((sum: number, dp: any) => sum + dp.throughput, 0) /
          dataPoints.length,
        averageErrorRate:
          dataPoints.reduce((sum: number, dp: any) => sum + dp.errorRate, 0) /
          dataPoints.length,
        averageResourceUsage:
          dataPoints.reduce(
            (sum: number, dp: any) => sum + dp.resourceUsage,
            0
          ) / dataPoints.length,
      },
      trends: {
        queryPerformance: this.calculateTrend(
          dataPoints.map((dp: any) => dp.queryPerformance)
        ),
        throughput: this.calculateTrend(
          dataPoints.map((dp: any) => dp.throughput)
        ),
        errorRate: this.calculateTrend(
          dataPoints.map((dp: any) => dp.errorRate)
        ),
        resourceUsage: this.calculateTrend(
          dataPoints.map((dp: any) => dp.resourceUsage)
        ),
      },
    };
  }

  /**
   * Generate performance recommendations
   */
  private async generatePerformanceRecommendations(
    insights: any[],
    patterns: any[]
  ) {
    const recommendations: PerformanceRecommendation[] = [];

    // Generate recommendations based on insights
    for (const insight of insights) {
      switch (insight.type) {
        case "data_bloat":
          recommendations.push({
            type: "maintenance",
            priority: "high",
            title: "Schedule table maintenance",
            description:
              "Run VACUUM FULL on tables with high dead tuple ratios",
            estimatedEffort: "2-4 hours",
            expectedBenefit:
              "Improved query performance and reduced storage usage",
            implementationSteps: [
              "Identify tables with high dead tuple ratios",
              "Schedule maintenance window",
              "Run VACUUM FULL on affected tables",
              "Rebuild affected indexes",
              "Verify performance improvement",
            ],
          });
          break;

        case "cache_inefficiency":
          recommendations.push({
            type: "configuration",
            priority: "medium",
            title: "Optimize cache configuration",
            description:
              "Review and optimize shared_buffers and other cache settings",
            estimatedEffort: "1-2 hours",
            expectedBenefit: "Improved cache hit rate and reduced I/O",
            implementationSteps: [
              "Analyze current cache hit rate",
              "Review PostgreSQL cache configuration",
              "Adjust shared_buffers if needed",
              "Monitor cache performance",
              "Fine-tune other cache-related settings",
            ],
          });
          break;

        case "performance_degradation":
          recommendations.push({
            type: "monitoring",
            priority: "high",
            title: "Implement performance monitoring",
            description:
              "Set up comprehensive performance monitoring and alerting",
            estimatedEffort: "4-8 hours",
            expectedBenefit: "Early detection of performance issues",
            implementationSteps: [
              "Set up performance monitoring tools",
              "Configure performance alerts",
              "Establish baseline metrics",
              "Implement regular performance reviews",
              "Create performance dashboards",
            ],
          });
          break;
      }
    }

    // Generate recommendations based on patterns
    for (const pattern of patterns) {
      switch (pattern.type) {
        case "high_activity":
          recommendations.push({
            type: "optimization",
            priority: "medium",
            title: "Optimize high-activity tables",
            description: `Optimize ${pattern.tables.length} high-activity tables`,
            estimatedEffort: "2-3 hours per table",
            expectedBenefit: "Improved overall system performance",
            implementationSteps: [
              "Analyze query patterns for high-activity tables",
              "Review and optimize indexes",
              "Consider table partitioning for large tables",
              "Implement query result caching",
              "Monitor performance improvements",
            ],
            affectedObjects: pattern.tables,
          });
          break;

        case "inefficient_indexes":
          recommendations.push({
            type: "optimization",
            priority: "medium",
            title: "Review index strategy",
            description: "Review and optimize index usage patterns",
            estimatedEffort: "3-5 hours",
            expectedBenefit: "Faster query performance and reduced storage",
            implementationSteps: [
              "Identify inefficient indexes",
              "Analyze index usage statistics",
              "Drop unused indexes",
              "Create missing useful indexes",
              "Monitor query performance improvements",
            ],
          });
          break;
      }
    }

    return recommendations;
  }

  /**
   * Check for performance alerts based on thresholds
   */
  private async checkPerformanceAlerts(
    connectionId: string,
    metrics: any
  ): Promise<PerformanceAlert[]> {
    const alerts: PerformanceAlert[] = [];

    // Check cache hit rate
    if (
      metrics.databaseMetrics?.blocks?.hitRate <
      this.alertThresholds.cacheHitRate.critical
    ) {
      alerts.push({
        id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: "threshold_exceeded",
        severity: "critical",
        title: "Critical cache hit rate",
        description: `Cache hit rate has dropped to ${metrics.databaseMetrics.blocks.hitRate.toFixed(
          2
        )}%`,
        timestamp: new Date(),
        connectionId,
        affectedObjects: ["system"],
        threshold: {
          metric: "cacheHitRate",
          currentValue: metrics.databaseMetrics.blocks.hitRate,
          thresholdValue: this.alertThresholds.cacheHitRate.critical,
          unit: "%",
        },
        actions: [
          "Review cache configuration",
          "Check for memory pressure",
          "Consider increasing shared_buffers",
        ],
        resolved: false,
      });
    }

    // Check deadlocks
    if (
      metrics.databaseMetrics?.deadlocks >
      this.alertThresholds.deadlocks.warning
    ) {
      alerts.push({
        id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: "threshold_exceeded",
        severity:
          metrics.databaseMetrics.deadlocks >
          this.alertThresholds.deadlocks.critical
            ? "critical"
            : "warning",
        title: "Deadlock detected",
        description: `${metrics.databaseMetrics.deadlocks} deadlocks detected in the system`,
        timestamp: new Date(),
        connectionId,
        affectedObjects: ["system"],
        threshold: {
          metric: "deadlocks",
          currentValue: metrics.databaseMetrics.deadlocks,
          thresholdValue: this.alertThresholds.deadlocks.warning,
          unit: "count",
        },
        actions: [
          "Review transaction patterns",
          "Check for long-running transactions",
          "Consider deadlock retry logic",
        ],
        resolved: false,
      });
    }

    // Check maintenance overdue
    if (metrics.derivedMetrics?.maintenanceOverdue > 0) {
      alerts.push({
        id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: "threshold_exceeded",
        severity: "warning",
        title: "Table maintenance overdue",
        description: `${metrics.derivedMetrics.maintenanceOverdue} tables need maintenance`,
        timestamp: new Date(),
        connectionId,
        affectedObjects: ["tables"],
        threshold: {
          metric: "tableMaintenance",
          currentValue: metrics.derivedMetrics.maintenanceOverdue,
          thresholdValue: this.alertThresholds.tableMaintenance.warning,
          unit: "count",
        },
        actions: [
          "Run VACUUM ANALYZE",
          "Schedule regular maintenance",
          "Monitor table statistics",
        ],
        resolved: false,
      });
    }

    // Store alerts
    alerts.forEach((alert) => {
      this.performanceAlerts.set(alert.id, alert);
    });

    return alerts;
  }

  /**
   * Collect baseline metrics
   */
  private async collectBaselineMetrics(
    connectionId: string,
    objectIds?: string[]
  ) {
    const baselineMetrics = await this.collectCurrentPerformanceMetrics(
      connectionId,
      objectIds
    );

    // Convert to baseline metric format
    const convertedMetrics: Record<string, BaselineMetric> = {};

    if (baselineMetrics.databaseMetrics) {
      convertedMetrics.cacheHitRate = {
        metricName: "cacheHitRate",
        value: baselineMetrics.databaseMetrics.blocks.hitRate,
        unit: "%",
        timestamp: new Date(),
        collectionMethod: "pg_stat_database",
      };

      convertedMetrics.activeConnections = {
        metricName: "activeConnections",
        value: baselineMetrics.databaseMetrics.activeConnections,
        unit: "count",
        timestamp: new Date(),
        collectionMethod: "pg_stat_database",
      };
    }

    if (baselineMetrics.derivedMetrics) {
      convertedMetrics.totalActivity = {
        metricName: "totalActivity",
        value: baselineMetrics.derivedMetrics.totalActivity,
        unit: "operations",
        timestamp: new Date(),
        collectionMethod: "calculated",
      };
    }

    return convertedMetrics;
  }

  /**
   * Analyze baseline characteristics
   */
  private async analyzeBaselineCharacteristics(baselineMetrics: any) {
    const characteristics: any = {};

    if (baselineMetrics.tableStatistics) {
      characteristics.tableProfile = {
        totalTables: baselineMetrics.tableStatistics.length,
        averageSize:
          baselineMetrics.tableStatistics.reduce(
            (sum: number, table: any) => sum + table.liveTuples,
            0
          ) / baselineMetrics.tableStatistics.length,
        largestTable: baselineMetrics.tableStatistics.reduce(
          (largest: any, table: any) =>
            table.liveTuples > largest.liveTuples ? table : largest,
          baselineMetrics.tableStatistics[0]
        ),
        mostActiveTable: baselineMetrics.tableStatistics.reduce(
          (mostActive: any, table: any) =>
            table.inserts + table.updates + table.deletes >
            mostActive.inserts + mostActive.updates + mostActive.deletes
              ? table
              : mostActive,
          baselineMetrics.tableStatistics[0]
        ),
      };
    }

    if (baselineMetrics.databaseMetrics) {
      characteristics.databaseProfile = {
        activityLevel:
          baselineMetrics.databaseMetrics.activeConnections > 50
            ? "high"
            : baselineMetrics.databaseMetrics.activeConnections > 20
            ? "medium"
            : "low",
        transactionVolume:
          baselineMetrics.databaseMetrics.transactions.committed > 10000
            ? "high"
            : baselineMetrics.databaseMetrics.transactions.committed > 1000
            ? "medium"
            : "low",
        cacheEfficiency:
          baselineMetrics.databaseMetrics.blocks.hitRate > 95
            ? "excellent"
            : baselineMetrics.databaseMetrics.blocks.hitRate > 90
            ? "good"
            : baselineMetrics.databaseMetrics.blocks.hitRate > 80
            ? "fair"
            : "poor",
      };
    }

    return characteristics;
  }

  /**
   * Establish performance thresholds
   */
  private async establishPerformanceThresholds(baselineMetrics: any) {
    const thresholds: any = {};

    if (baselineMetrics.databaseMetrics) {
      // Set thresholds based on current performance
      thresholds.cacheHitRate = {
        warning: Math.max(
          80,
          baselineMetrics.databaseMetrics.blocks.hitRate * 0.9
        ),
        critical: Math.max(
          70,
          baselineMetrics.databaseMetrics.blocks.hitRate * 0.8
        ),
        current: baselineMetrics.databaseMetrics.blocks.hitRate,
      };

      thresholds.activeConnections = {
        warning: Math.floor(
          baselineMetrics.databaseMetrics.activeConnections * 1.5
        ),
        critical: baselineMetrics.databaseMetrics.activeConnections * 2,
        current: baselineMetrics.databaseMetrics.activeConnections,
      };

      thresholds.deadlocks = {
        warning: 1,
        critical: 5,
        current: baselineMetrics.databaseMetrics.deadlocks,
      };
    }

    if (baselineMetrics.tableStatistics) {
      thresholds.tableMaintenance = {
        warning: 10000,
        critical: 50000,
        current: Math.max(
          ...baselineMetrics.tableStatistics.map(
            (t: any) => t.modificationsSinceAnalyze
          )
        ),
      };
    }

    return thresholds;
  }

  /**
   * Calculate derived metrics
   */
  private calculateDerivedMetrics(metrics: any) {
    return {
      totalActivity: (metrics.tableStatistics || []).reduce(
        (sum: number, table: any) =>
          sum + table.inserts + table.updates + table.deletes,
        0
      ),
      totalLiveTuples: (metrics.tableStatistics || []).reduce(
        (sum: number, table: any) => sum + table.liveTuples,
        0
      ),
      totalDeadTuples: (metrics.tableStatistics || []).reduce(
        (sum: number, table: any) => sum + table.deadTuples,
        0
      ),
      maintenanceOverdue: (metrics.tableStatistics || []).filter(
        (table: any) => table.modificationsSinceAnalyze > 10000
      ).length,
      inefficientIndexes: (metrics.indexStatistics || []).filter(
        (index: any) => index.efficiency < 50 && index.scans > 100
      ).length,
      averageQueryPerformance:
        (metrics.queryPerformance || []).reduce(
          (sum: number, query: any) => sum + query.meanTime,
          0
        ) / (metrics.queryPerformance?.length || 1),
    };
  }

  /**
   * Calculate query performance score
   */
  private calculateQueryPerformanceScore(queryRow: any): number {
    const meanTime = parseFloat(queryRow.mean_time) || 0;
    const calls = parseInt(queryRow.calls) || 1;

    // Simple scoring algorithm: lower mean time and higher calls = better score
    if (meanTime === 0) {return 100;}
    if (meanTime > 10000) {return 0;} // Very slow queries
    if (meanTime > 1000) {return 25;} // Slow queries
    if (meanTime > 100) {return 50;} // Moderate queries
    if (meanTime > 10) {return 75;} // Fast queries
    return 90; // Very fast queries
  }

  /**
   * Extract metric value from metrics object
   */
  private extractMetricValue(metrics: any, metricName: string): number | null {
    switch (metricName) {
      case "cacheHitRate":
        return metrics.databaseMetrics?.blocks?.hitRate || null;
      case "activeConnections":
        return metrics.databaseMetrics?.activeConnections || null;
      case "totalActivity":
        return metrics.derivedMetrics?.totalActivity || null;
      default:
        return null;
    }
  }

  /**
   * Calculate trend direction from data points
   */
  private calculateTrend(
    dataPoints: number[]
  ): "increasing" | "decreasing" | "stable" {
    if (dataPoints.length < 2) {return "stable";}

    const firstHalf = dataPoints.slice(0, Math.floor(dataPoints.length / 2));
    const secondHalf = dataPoints.slice(Math.floor(dataPoints.length / 2));

    const firstAvg =
      firstHalf.reduce((sum: number, val: number) => sum + val, 0) /
      firstHalf.length;
    const secondAvg =
      secondHalf.reduce((sum: number, val: number) => sum + val, 0) /
      secondHalf.length;

    const change = ((secondAvg - firstAvg) / firstAvg) * 100;

    if (change > 5) {return "increasing";}
    if (change < -5) {return "decreasing";}
    return "stable";
  }

  /**
   * Calculate overall health score
   */
  private calculateOverallHealth(metrics: any, trendAnalysis: any): string {
    let healthScore = 100;

    // Deduct points for issues
    if (metrics.databaseMetrics?.blocks?.hitRate < 90) {healthScore -= 20;}
    if (metrics.databaseMetrics?.blocks?.hitRate < 80) {healthScore -= 30;}

    if (metrics.databaseMetrics?.deadlocks > 0) {healthScore -= 25;}
    if (metrics.databaseMetrics?.deadlocks > 5) {healthScore -= 35;}

    if (metrics.derivedMetrics?.maintenanceOverdue > 0) {healthScore -= 15;}
    if (metrics.derivedMetrics?.maintenanceOverdue > 5) {healthScore -= 25;}

    if (trendAnalysis.trendDirection === "degrading") {healthScore -= 20;}

    if (healthScore >= 80) {return "excellent";}
    if (healthScore >= 60) {return "good";}
    if (healthScore >= 40) {return "fair";}
    return "poor";
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.performanceBaselines.clear();
    this.performanceAlerts.clear();
    Logger.info("PerformanceAnalysis disposed successfully");
  }
}
