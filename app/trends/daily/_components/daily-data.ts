import logger from '@/lib/logger';
import { DAILY_REPORT_NOT_FOUND_ERROR } from '@/lib/constants/daily-trend';
import {
  getDailyTrendReport,
  previousJSTDay,
  type DailyTrendResponse,
} from '@/lib/services/trend-report/daily-report';

export type {
  DailyTrendResponse,
  SerializedTrendReport,
} from '@/lib/services/trend-report/daily-report';

/**
 * 日間トレンドレポートの初期データを取得（Server Component用）
 */
export async function fetchInitialDailyData(): Promise<DailyTrendResponse> {
  try {
    const result = await getDailyTrendReport(previousJSTDay());

    if (result.kind === 'not-found') {
      return {
        success: false,
        error: DAILY_REPORT_NOT_FOUND_ERROR,
        latestAvailableDate: null,
      };
    }

    return result.response;
  } catch (error) {
    logger.error({ err: error }, 'Failed to get daily trend report (SC)');
    return {
      success: false,
      error: 'Internal server error',
    };
  }
}
