import { TechEntity, MetricSource } from '@prisma/client';
import { MetricCollector, MetricResult, parseExternalIds } from './types';

/**
 * Collects weekly npm download counts for TechEntities with an npm externalId.
 * API: GET https://api.npmjs.org/downloads/point/last-week/{package}
 * No auth required.
 */
export class NpmCollector implements MetricCollector {
  readonly source = MetricSource.NPM_DOWNLOADS;

  canCollect(entity: TechEntity): boolean {
    const ids = parseExternalIds(entity.externalIds);
    return !!ids?.npm;
  }

  async collect(entity: TechEntity): Promise<MetricResult | null> {
    const ids = parseExternalIds(entity.externalIds);
    const packageName = ids?.npm;
    if (!packageName) return null;

    const url = `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(packageName)}`;

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'TechTrend-MetricsCollector' },
      });

      if (!response.ok) {
        console.error(
          `[NpmCollector] Failed to fetch ${packageName}: ${response.status} ${response.statusText}`
        );
        return null;
      }

      const data = (await response.json()) as { downloads?: number };
      const downloads = data.downloads;

      if (typeof downloads !== 'number') {
        console.error(
          `[NpmCollector] Invalid response for ${packageName}: missing downloads`
        );
        return null;
      }

      return {
        value: downloads,
        measuredAt: new Date(),
      };
    } catch (error) {
      console.error(
        `[NpmCollector] Error fetching ${packageName}:`,
        error instanceof Error ? error.message : String(error)
      );
      return null;
    }
  }
}
