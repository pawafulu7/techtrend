import { getTrendAnalysis } from '@/lib/services/trend-analysis';
import { getTrendingKeywords } from '@/lib/services/trending-keywords';
import { getDashboardStats } from '@/lib/services/dashboard-stats';
import logger from '@/lib/logger';

export type { TrendingKeyword, NewTag } from '@/lib/services/trending-keywords';
export type { TrendAnalysis } from '@/lib/services/trend-analysis';
export interface SourceDataItem {
  name: string;
  value: number;
  percentage: number;
  [key: string]: string | number | undefined;
}

export async function fetchKeywordsData() {
  try {
    const { trending, newTags, period } = await getTrendingKeywords();
    // 集計の終点（= 集計した時刻）。画面に集計時刻として出す（issue #707）
    return { trending, newTags, aggregatedAt: period?.to ?? null };
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
      value: { sources: sourcesRaw, generatedAt },
    } = await getDashboardStats();
    const topSources = sourcesRaw.slice(0, 6);
    const otherSources = sourcesRaw.slice(6);

    const othersCount = otherSources.reduce(
      (sum, source) => sum + source.count,
      0
    );
    const othersPercentage = otherSources.reduce(
      (sum, source) => sum + source.percentage,
      0
    );

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
