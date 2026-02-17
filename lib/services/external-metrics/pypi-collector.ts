import { TechEntity, MetricSource } from '@prisma/client';
import { logger } from '@/lib/logger';
import { MetricCollector, MetricResult, parseExternalIds } from './types';

/**
 * Collects recent PyPI download counts for TechEntities with a pypi externalId.
 * API: GET https://pypistats.org/api/packages/{package}/recent
 * No auth required.
 */
export class PyPICollector implements MetricCollector {
  readonly source = MetricSource.PYPI_DOWNLOADS;

  canCollect(entity: TechEntity): boolean {
    const ids = parseExternalIds(entity.externalIds);
    return !!ids?.pypi;
  }

  async collect(entity: TechEntity): Promise<MetricResult | null> {
    const ids = parseExternalIds(entity.externalIds);
    const packageName = ids?.pypi;
    if (!packageName) return null;

    const url = `https://pypistats.org/api/packages/${encodeURIComponent(packageName)}/recent`;

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'TechTrend-MetricsCollector' },
      });

      if (!response.ok) {
        logger.error(
          { context: 'PyPICollector', packageName, status: response.status },
          `Failed to fetch ${packageName}: ${response.status} ${response.statusText}`
        );
        return null;
      }

      const data = (await response.json()) as {
        data?: { last_week?: number; last_month?: number; last_day?: number };
      };
      const downloads =
        data.data?.last_week ?? data.data?.last_month ?? data.data?.last_day;

      if (typeof downloads !== 'number') {
        logger.error(
          { context: 'PyPICollector', packageName },
          `Invalid response for ${packageName}: missing download stats`
        );
        return null;
      }

      return {
        value: downloads,
        measuredAt: new Date(),
      };
    } catch (error) {
      logger.error(
        {
          context: 'PyPICollector',
          packageName,
          error: error instanceof Error ? error.message : String(error),
        },
        `Error fetching ${packageName}`
      );
      return null;
    }
  }
}
