import { TechEntity, MetricSource } from '@prisma/client';
import { MetricCollector, MetricResult, parseExternalIds } from './types';

/**
 * Collects GitHub stargazer counts for TechEntities with a github externalId.
 * API: GET https://api.github.com/repos/{owner}/{repo}
 * Auth: Optional Bearer token via GITHUB_TOKEN env var (increases rate limit).
 */
export class GitHubCollector implements MetricCollector {
  readonly source = MetricSource.GITHUB_STARS;

  canCollect(entity: TechEntity): boolean {
    const ids = parseExternalIds(entity.externalIds);
    return !!ids?.github;
  }

  async collect(entity: TechEntity): Promise<MetricResult | null> {
    const ids = parseExternalIds(entity.externalIds);
    const repo = ids?.github;
    if (!repo) return null;

    const url = `https://api.github.com/repos/${repo}`;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'TechTrend-MetricsCollector',
    };

    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    try {
      const response = await fetch(url, { headers });

      if (!response.ok) {
        console.error(
          `[GitHubCollector] Failed to fetch ${repo}: ${response.status} ${response.statusText}`
        );
        return null;
      }

      const data = (await response.json()) as { stargazers_count?: number };
      const stars = data.stargazers_count;

      if (typeof stars !== 'number') {
        console.error(
          `[GitHubCollector] Invalid response for ${repo}: missing stargazers_count`
        );
        return null;
      }

      return {
        value: stars,
        measuredAt: new Date(),
      };
    } catch (error) {
      console.error(
        `[GitHubCollector] Error fetching ${repo}:`,
        error instanceof Error ? error.message : String(error)
      );
      return null;
    }
  }
}
