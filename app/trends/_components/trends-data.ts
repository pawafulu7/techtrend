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
    const { trending, newTags } = await getTrendingKeywords();
    return { trending, newTags };
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

export async function fetchSourceData(): Promise<SourceDataItem[]> {
  try {
    const {
      value: { sources: sourcesRaw },
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

    return sourceData;
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch source distribution (SC)');
    throw error;
  }
}
