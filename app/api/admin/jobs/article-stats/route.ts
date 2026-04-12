/**
 * Article Stats API
 * Returns article collection statistics by source and daily summary generation rates
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/get-session';
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';
import type {
  SourceStats,
  DailyStats,
  ArticleStatsResponse,
} from '@/app/dashboard/jobs/types';

const DEFAULT_RANGE_DAYS = 7;
const MIN_RANGE_DAYS = 1;
const MAX_RANGE_DAYS = 90;

/**
 * Check if an article has a valid (non-empty) summary
 */
function hasValidSummary(summary: string | null | undefined): boolean {
  return typeof summary === 'string' && summary.trim().length > 0;
}

export async function GET(request: NextRequest) {
  // Authentication check
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'Unauthorized. Authentication required.' },
      { status: 401 }
    );
  }

  // Authorization check (admin only)
  if (session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden. Admin access required.' },
      { status: 403 }
    );
  }

  try {
    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const rangeParam = searchParams.get('range') || `${DEFAULT_RANGE_DAYS}d`;
    const parsedDays = parseInt(rangeParam.replace('d', ''), 10);
    // Validate range: must be between MIN and MAX, default to DEFAULT if invalid
    const rangeDays =
      Number.isNaN(parsedDays) ||
      parsedDays < MIN_RANGE_DAYS ||
      parsedDays > MAX_RANGE_DAYS
        ? DEFAULT_RANGE_DAYS
        : parsedDays;

    // Calculate date range (JST-based)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - rangeDays);
    startDate.setHours(0, 0, 0, 0);

    // Get articles within the date range with source name
    const articles = await prisma.article.findMany({
      where: {
        createdAt: { gte: startDate },
      },
      select: {
        id: true,
        source: {
          select: {
            name: true,
          },
        },
        createdAt: true,
        summary: true,
      },
    });

    // Calculate source statistics
    const sourceCountMap = new Map<string, number>();
    for (const article of articles) {
      const sourceName = article.source?.name || 'Unknown';
      sourceCountMap.set(sourceName, (sourceCountMap.get(sourceName) || 0) + 1);
    }

    const totalArticles = articles.length;
    const bySource: SourceStats[] = Array.from(sourceCountMap.entries())
      .map(([source, count]) => ({
        source,
        count,
        percentage:
          totalArticles > 0
            ? Math.round((count / totalArticles) * 1000) / 10
            : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Calculate daily statistics
    const dailyMap = new Map<string, { total: number; withSummary: number }>();

    for (const article of articles) {
      const dateKey = article.createdAt.toISOString().split('T')[0];
      const existing = dailyMap.get(dateKey) || { total: 0, withSummary: 0 };
      existing.total++;
      if (hasValidSummary(article.summary)) {
        existing.withSummary++;
      }
      dailyMap.set(dateKey, existing);
    }

    // Fill in missing days with zeros
    const byDate: DailyStats[] = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateKey = currentDate.toISOString().split('T')[0];
      const stats = dailyMap.get(dateKey) || { total: 0, withSummary: 0 };
      byDate.push({
        date: dateKey,
        total: stats.total,
        withSummary: stats.withSummary,
        summaryRate:
          stats.total > 0
            ? Math.round((stats.withSummary / stats.total) * 1000) / 10
            : 0,
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Sort by date descending (most recent first)
    byDate.sort((a, b) => b.date.localeCompare(a.date));

    // Calculate totals
    const totalWithSummary = articles.filter((a) =>
      hasValidSummary(a.summary)
    ).length;

    const response: ArticleStatsResponse = {
      bySource,
      byDate,
      totals: {
        articles: totalArticles,
        summaries: totalWithSummary,
        overallRate:
          totalArticles > 0
            ? Math.round((totalWithSummary / totalArticles) * 1000) / 10
            : 0,
      },
      period: {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0],
        days: rangeDays,
      },
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    logger.error({ error }, '[ArticleStatsAPI] Failed to fetch stats');
    return NextResponse.json(
      { error: 'Failed to fetch article stats' },
      { status: 500 }
    );
  }
}
