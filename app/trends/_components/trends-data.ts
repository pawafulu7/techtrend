import { getTrendAnalysis } from '@/lib/services/trend-analysis';
import { getTrendingSeries } from '@/lib/services/trending-keywords';
import { getDashboardStats } from '@/lib/services/dashboard-stats';
import logger from '@/lib/logger';

export type {
  TrendingKeywordWithSeries as TrendingKeyword,
  NewTag,
} from '@/lib/services/trending-keywords';
export type { TrendAnalysis } from '@/lib/services/trend-analysis';
export interface SourceDataItem {
  name: string;
  value: number;
  percentage: number;
  [key: string]: string | number | undefined;
}

export async function fetchKeywordsData() {
  try {
    // 急上昇の一覧・7 区間の件数・総数・新着タグ・集計の時刻を、すべて同じ値（1 つのキャッシュ）から取る
    const { trending, trendingTotal, newTags, period } =
      await getTrendingSeries();
    // 集計の終点（= 集計した時刻）。画面に集計時刻として出す（issue #707）
    return {
      trending,
      trendingTotal,
      newTags,
      aggregatedAt: period?.to ?? null,
    };
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch trending keywords (SC)');
    throw error;
  }
}

export async function fetchAnalysisData(days: number) {
  try {
    return await getTrendAnalysis(days);
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch trend analysis (SC)');
    throw error;
  }
}

export interface SourceDistribution {
  items: SourceDataItem[];
  /** 集計した時刻。この項目が入る前のキャッシュでは null */
  aggregatedAt: string | null;
}

export async function fetchSourceData(): Promise<SourceDistribution> {
  try {
    const {
      value: { overview, sources: sourcesRaw, generatedAt },
    } = await getDashboardStats();
    const topSources = sourcesRaw.slice(0, 6);
    const otherSources = sourcesRaw.slice(6);

    const othersCount = otherSources.reduce(
      (sum, source) => sum + source.count,
      0
    );
    // 丸め済みの各ソースの割合を足すと、丸めの誤差がたまり（0.04% × 10 が 0%）、浮動小数の
    // 端数も出る（31.30000000000002%）。件数の合計から、各ソースと同じ式で一度だけ丸める
    const othersPercentage =
      overview.total > 0
        ? Math.round((othersCount / overview.total) * 1000) / 10
        : 0;

    const sourceData: SourceDataItem[] = topSources.map((source) => ({
      name: source.name,
      value: source.count,
      percentage: source.percentage,
    }));

    if (othersCount > 0) {
      sourceData.push({
        name: 'その他',
        value: othersCount,
        percentage: othersPercentage,
      });
    }

    return { items: sourceData, aggregatedAt: generatedAt ?? null };
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch source distribution (SC)');
    throw error;
  }
}
