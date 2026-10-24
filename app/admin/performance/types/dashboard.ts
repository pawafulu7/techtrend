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

// キャッシュトレンド（時系列データ）
export interface CacheTrends {
  hitRate: TimeSeriesData[];
  size: TimeSeriesData[];
  evictions: TimeSeriesData[];
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
    trends: CacheTrends;
  };
  redis: RedisStats;
  summary: {
    totalCacheHitRate: string;
    batchSizes: {
      favorite: number | 'N/A';
      view: number | 'N/A';
    };
    latencyP95: {
      favorite: number | 'N/A';
      view: number | 'N/A';
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
  isIncreaseGood?: boolean; // 増加が良いことを示すフラグ（デフォルト: true）
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

// デフォルト値生成関数
export function createEmptyPerformanceMetrics(): PerformanceMetrics {
  return {
    timestamp: new Date().toISOString(),
    optimizers: {
      favorite: {
        batchSize: 0,
        latencyP50: 0,
        latencyP95: 0,
        latencyP99: 0,
        throughput: 0,
        queueWait: 0,
        cacheHitRate: 0,
        cacheHits: 0,
        cacheMisses: 0
      },
      view: {
        batchSize: 0,
        latencyP50: 0,
        latencyP95: 0,
        latencyP99: 0,
        throughput: 0,
        queueWait: 0,
        cacheHitRate: 0,
        cacheHits: 0,
        cacheMisses: 0
      }
    },
    dataloaders: {
      favorite: {
        l1Hits: 0,
        l2Hits: 0,
        dbQueries: 0,
        totalRequests: 0,
        batchCount: 0,
        hitRate: '0%'
      },
      view: {
        l1Hits: 0,
        l2Hits: 0,
        dbQueries: 0,
        totalRequests: 0,
        batchCount: 0,
        hitRate: '0%'
      }
    },
    caches: {
      stats: {
        hits: 0,
        misses: 0,
        hitRate: 0,
        size: 0,
        evictions: 0,
        ttl: 0
      },
      trends: {
        hitRate: [],
        size: [],
        evictions: []
      }
    },
    redis: {
      memoryUsed: 'N/A',
      memoryPeak: 'N/A',
      connected: false
    },
    summary: {
      totalCacheHitRate: '0%',
      batchSizes: {
        favorite: 0,
        view: 0
      },
      latencyP95: {
        favorite: 0,
        view: 0
      }
    },
    recommendations: []
  };
}