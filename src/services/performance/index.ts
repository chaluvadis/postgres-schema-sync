// Performance Analysis Services - Consolidated performance monitoring and analysis
// This module provides a streamlined replacement for duplicate performance analysis functionality

export { StreamlinedPerformanceAnalysisService } from './StreamlinedPerformanceAnalysisService';

// Re-export performance analysis types for convenience
export type {
    PerformanceTrend,
    DataPoint,
    SystemPerformanceTrend,
    PerformanceRecommendation,
    PerformanceAlert,
    PerformanceBaseline,
    BaselineMetric,
    SystemBaselineMetric
} from './StreamlinedPerformanceAnalysisService';