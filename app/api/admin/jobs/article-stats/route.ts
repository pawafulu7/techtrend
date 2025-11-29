/**
 * Article Stats API
 * Returns article collection statistics by source and daily summary generation rates
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';

export interface SourceStats {
  source: string;
  count: number;
  percentage: number;
}

export interface DailyStats {
  date: string;
  total: number;
  withSummary: number;
  summaryRate: number;
}

export interface ArticleStatsResponse {
  bySource: SourceStats[];
  byDate: DailyStats[];
  totals: {
    articles: number;
    summaries: number;
    overallRate: number;
  };
  period: {
    start: string;
    end: string;
    days: number;
  };
  lastUpdated: string;
}

const DEFAULT_RANGE_DAYS = 7;

export async function GET(request: NextRequest) {
  // Admin authorization check
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Unauthorized. Admin access required.' },
      { status: 401 }
    );
  }

  try {
    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const rangeParam = searchParams.get('range') || `${DEFAULT_RANGE_DAYS}d`;
    const rangeDays = parseInt(rangeParam.replace('d', ''), 10) || DEFAULT_RANGE_DAYS;

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
        percentage: totalArticles > 0 ? Math.round((count / totalArticles) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Calculate daily statistics
    const dailyMap = new Map<string, { total: number; withSummary: number }>();

    for (const article of articles) {
      const dateKey = article.createdAt.toISOString().split('T')[0];
      const existing = dailyMap.get(dateKey) || { total: 0, withSummary: 0 };
      existing.total++;
      if (article.summary && article.summary.trim().length > 0) {
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
        summaryRate: stats.total > 0
          ? Math.round((stats.withSummary / stats.total) * 1000) / 10
          : 0,
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Sort by date descending (most recent first)
    byDate.sort((a, b) => b.date.localeCompare(a.date));

    // Calculate totals
    const totalWithSummary = articles.filter(
      (a) => a.summary && a.summary.trim().length > 0
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
