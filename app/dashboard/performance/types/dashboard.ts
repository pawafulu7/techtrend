/**
 * Performance Dashboard Types
 * DBアクセス最適化Phase 3のメトリクスダッシュボード型定義
 */

// BatchOptimizer メトリクス
export interface BatchOptimizerMetrics {
  batchSize: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  throughput: number;
  queueWait: number;
  cacheHitRate: number;
  cacheHits: number;
  cacheMisses: number;
}

// DataLoader統計
export interface DataLoaderStats {
  l1Hits: number;
  l2Hits: number;
  dbQueries: number;
  totalRequests: number;
  batchCount: number;
  hitRate: string;
  memoryCache?: {
    size: number;
    hits: number;
    misses: number;
  };
}

// キャッシュ統計
export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  evictions: number;
  ttl: number;
}

// Redis統計
export interface RedisStats {
  memoryUsed: string;
  memoryPeak: string;
  connected: boolean;
  latency?: number;
}

// 統合メトリクス
export interface PerformanceMetrics {
  timestamp: string;
  optimizers: {
    favorite: BatchOptimizerMetrics;
    view: BatchOptimizerMetrics;
  };
  dataloaders: {
    favorite: DataLoaderStats;
    view: DataLoaderStats;
  };
  caches: {
    stats: CacheStats;
    trends: CacheStats;
  };
  redis: RedisStats;
  summary: {
    totalCacheHitRate: string;
    batchSizes: {
      favorite: number;
      view: number;
    };
    latencyP95: {
      favorite: number;
      view: number;
    };
  };
  recommendations?: string[];
}

// グラフ用時系列データ
export interface TimeSeriesData {
  time: string;
  value: number;
}

// メトリクスヒストリー
export interface MetricsHistory {
  cacheHitRate: TimeSeriesData[];
  latency: TimeSeriesData[];
  batchSize: TimeSeriesData[];
  throughput: TimeSeriesData[];
}

// エラー状態
export interface DashboardError {
  message: string;
  code?: string;
  timestamp: string;
}

// ダッシュボード状態
export interface DashboardState {
  metrics: PerformanceMetrics | null;
  history: MetricsHistory;
  loading: boolean;
  error: DashboardError | null;
  lastUpdated: string | null;
}

// メトリクスカードプロップス
export interface MetricsCardProps {
  title: string;
  value: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string;
  status?: 'good' | 'warning' | 'critical';
  description?: string;
}

// トレンドチャートプロップス
export interface TrendChartProps {
  title: string;
  data: TimeSeriesData[];
  dataKey?: string;
  color?: string;
  height?: number;
  format?: (value: number) => string;
}

// 最適化推奨
export interface OptimizationRecommendation {
  type: 'performance' | 'cache' | 'batch' | 'memory';
  severity: 'low' | 'medium' | 'high';
  message: string;
  action?: string;
}