import { TechEntity, MetricSource } from '@prisma/client';
import { MetricCollector, MetricResult, parseExternalIds } from './types';

/**
 * Collects Stack Overflow question counts for TechEntities with a stackoverflow externalId.
 * API: GET https://api.stackexchange.com/2.3/tags/{tag}/info?site=stackoverflow
 * Auth: Optional SO_API_KEY env var (increases rate limit).
 */
export class StackOverflowCollector implements MetricCollector {
  readonly source = MetricSource.SO_QUESTIONS;

  canCollect(entity: TechEntity): boolean {
    const ids = parseExternalIds(entity.externalIds);
    return !!ids?.stackoverflow;
  }

  async collect(entity: TechEntity): Promise<MetricResult | null> {
    const ids = parseExternalIds(entity.externalIds);
    const tag = ids?.stackoverflow;
    if (!tag) return null;

    const params = new URLSearchParams({ site: 'stackoverflow' });
    if (process.env.SO_API_KEY) {
      params.set('key', process.env.SO_API_KEY);
    }

    const url = `https://api.stackexchange.com/2.3/tags/${encodeURIComponent(tag)}/info?${params.toString()}`;

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'TechTrend-MetricsCollector' },
      });

      if (!response.ok) {
        console.error(
          `[StackOverflowCollector] Failed to fetch ${tag}: ${response.status} ${response.statusText}`
        );
        return null;
      }

      const data = (await response.json()) as {
        items?: Array<{ count?: number }>;
      };
      const count = data.items?.[0]?.count;

      if (typeof count !== 'number') {
        console.error(
          `[StackOverflowCollector] Invalid response for ${tag}: missing items[0].count`
        );
        return null;
      }

      return {
        value: count,
        measuredAt: new Date(),
      };
    } catch (error) {
      console.error(
        `[StackOverflowCollector] Error fetching ${tag}:`,
        error instanceof Error ? error.message : String(error)
      );
      return null;
    }
  }
}
