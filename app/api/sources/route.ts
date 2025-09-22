import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { sourceCache } from '@/lib/cache/source-cache';
import logger from '@/lib/logger';
import { parseBoolean } from '@/lib/utils/env-parser';
import { Prisma } from '@prisma/client';
import { inferSourceCategory, sortSources, type SourceCategory } from '@/lib/utils/source-helpers';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Next.js 15.xでのNextRequest対応
    const url = new URL(request.url);
    const searchParams = url.searchParams;
    const category = searchParams.get('category') as SourceCategory | null;
    const sortBy = searchParams.get('sortBy') || 'articles';
    const order = searchParams.get('order') || 'desc';
    const search = searchParams.get('search');
    const ids = searchParams.get('ids');

    // idsパラメータがある場合はキャッシュを使わない（特定のソース取得）
    if (!ids) {
      // キャッシュから統計情報付きの全ソースを取得
      const cachedSourcesWithStats = await sourceCache.getAllSourcesWithStats();
      
      // 検索フィルタリングを適用
      let filteredSources = cachedSourcesWithStats;
      
      if (search) {
        filteredSources = filteredSources.filter(source =>
          source.name.toLowerCase().includes(search.toLowerCase())
        );
      }

      // すでに統計情報とカテゴリが含まれているのでそのまま使用
      const sourcesWithStats = filteredSources;

      // キャッシュ配列のコピーを作成して破壊を防ぐ
      let result = [...sourcesWithStats];
      if (category) {
        result = result.filter(s => s.category === category);
      }

      // ソート
      result.sort((a, b) => {
        let aValue, bValue;
        switch (sortBy) {
          case 'articles':
            aValue = a.stats.totalArticles;
            bValue = b.stats.totalArticles;
            break;
          case 'quality':
            aValue = a.stats.avgQualityScore;
            bValue = b.stats.avgQualityScore;
            break;
          case 'frequency':
            aValue = a.stats.publishFrequency;
            bValue = b.stats.publishFrequency;
            break;
          case 'name':
            aValue = a.name;
            bValue = b.name;
            break;
          default:
            aValue = a.stats.totalArticles;
            bValue = b.stats.totalArticles;
        }

        if (sortBy === 'name') {
          return order === 'asc' 
            ? (aValue as string).localeCompare(bValue as string)
            : (bValue as string).localeCompare(aValue as string);
        } else {
          return order === 'asc' 
            ? (aValue as number) - (bValue as number)
            : (bValue as number) - (aValue as number);
        }
      });

      const responseTime = Date.now() - startTime;
      const response = NextResponse.json({
        sources: result,
        totalCount: result.length
      });
      response.headers.set('X-Cache-Status', 'HIT');
      response.headers.set('X-Response-Time', `${responseTime}ms`);
      
      return response;
    }

    // 特定のIDsの場合は従来の処理（キャッシュなし）
    // フィーチャーフラグで最適化バージョンを選択
    const useOptimized = parseBoolean(process.env.USE_OPTIMIZED_SOURCES_API, false);

    if (useOptimized) {
      // Phase 2: メモリ最適化版（集計クエリのみ実行）
      const [sources, sourceStats] = await Promise.all([
        // 基本的なソース情報
        prisma.source.findMany({
          where: {
            enabled: true,
            ...(ids && {
              id: {
                in: ids.split(',')
              }
            }),
            ...(search && {
              name: {
                contains: search,
                mode: 'insensitive'
              }
            })
          }
        }),
        // 統計情報を集計クエリで取得
        prisma.$queryRaw`
          SELECT
            s.id as source_id,
            COUNT(a.id)::int as total_articles,
            COALESCE(AVG(a."qualityScore")::int, 0) as avg_quality_score,
            COUNT(CASE WHEN a."publishedAt" >= NOW() - INTERVAL '30 days' THEN 1 END)::int as recent_articles,
            COUNT(CASE WHEN a."publishedAt" >= NOW() - INTERVAL '60 days'
                       AND a."publishedAt" < NOW() - INTERVAL '30 days' THEN 1 END)::int as past_month_articles,
            MAX(a."publishedAt") as last_published
          FROM "Source" s
          LEFT JOIN "Article" a ON s.id = a."sourceId"
          WHERE s.enabled = true
          ${ids ? Prisma.sql`AND s.id IN (${Prisma.join(ids.split(','))})` : Prisma.empty}
          ${search ? Prisma.sql`AND s.name ILIKE ${`%${search}%`}` : Prisma.empty}
          GROUP BY s.id
        ` as Promise<Array<{
          source_id: string;
          total_articles: number;
          avg_quality_score: number;
          recent_articles: number;
          past_month_articles: number;
          last_published: Date | null;
        }>>
      ]);

      // 統計情報をマップ化
      const statsMap = new Map(sourceStats.map(stat => [stat.source_id, stat]));

      // ソース情報と統計を結合
      const sourcesWithStats = sources.map(source => {
        const stats = statsMap.get(source.id);
        const publishFrequency = stats ? stats.recent_articles / 30 : 0;
        const growthRate = stats && stats.past_month_articles > 0
          ? Math.round(((stats.recent_articles - stats.past_month_articles) / stats.past_month_articles) * 100)
          : stats && stats.recent_articles > 0 ? 100 : 0;

        // カテゴリー推定（共通関数を使用）
        const category = inferSourceCategory(source.name);

        return {
          id: source.id,
          name: source.name,
          type: source.type,
          url: source.url,
          enabled: source.enabled,
          category,
          stats: {
            totalArticles: stats?.total_articles || 0,
            avgQualityScore: stats?.avg_quality_score || 0,
            popularTags: [], // タグ情報は別途必要な場合のみ取得
            publishFrequency: Math.round(publishFrequency * 10) / 10,
            lastPublished: stats?.last_published || null,
            growthRate
          }
        };
      });

      // カテゴリーフィルタリング
      let filteredSources = sourcesWithStats;
      if (category) {
        filteredSources = filteredSources.filter(s => s.category === category);
      }

      // ソート処理（共通関数を使用）
      filteredSources = sortSources(filteredSources, sortBy, order);

      const responseTime = Date.now() - startTime;
      const response = NextResponse.json({
        sources: filteredSources,
        totalCount: filteredSources.length
      });
      response.headers.set('X-Cache-Status', 'MISS');
      response.headers.set('X-Response-Time', `${responseTime}ms`);
      response.headers.set('X-Optimization', 'memory-optimized');

      logger.info({
        route: '/api/sources',
        optimization: 'memory-optimized',
        responseTime,
        sourceCount: filteredSources.length
      }, 'Sources API with memory optimization');

      return response;
    }

    // Phase 1: 従来の実装（全記事データを取得）
    const sources = await prisma.source.findMany({
      where: {
        enabled: true,
        ...(ids && {
          id: {
            in: ids.split(',')
          }
        }),
        ...(search && {
          name: {
            contains: search,
            mode: 'insensitive'
          }
        })
      },
      include: {
        _count: {
          select: {
            articles: true
          }
        },
        articles: {
          select: {
            qualityScore: true,
            publishedAt: true,
            tags: {
              select: {
                name: true
              }
            }
          },
          orderBy: {
            publishedAt: 'desc'
          }
        }
      }
    });

    // 統計情報を計算
    const sourcesWithStats = sources.map(source => {
      const articles = source.articles;
      const totalArticles = source._count.articles;

      // 品質スコアの平均
      const avgQualityScore = totalArticles > 0
        ? articles.reduce((sum, a) => sum + a.qualityScore, 0) / totalArticles
        : 0;

      // 人気タグの集計
      const tagCounts: Record<string, number> = {};
      articles.forEach(article => {
        article.tags.forEach(tag => {
          tagCounts[tag.name] = (tagCounts[tag.name] || 0) + 1;
        });
      });
      const popularTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tag]) => tag);

      // 最終投稿日
      const lastPublished = articles.length > 0
        ? articles[0].publishedAt
        : null;

      // 投稿頻度（過去30日間の記事数から計算）
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentArticles = articles.filter(
        a => a.publishedAt >= thirtyDaysAgo
      );
      const publishFrequency = recentArticles.length / 30;
      
      // 成長率計算: 過去30日と過去60-30日の比較
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      
      const pastMonthArticles = articles.filter(
        a => a.publishedAt >= sixtyDaysAgo && a.publishedAt < thirtyDaysAgo
      );
      
      const currentMonthCount = recentArticles.length;
      const pastMonthCount = pastMonthArticles.length;
      const growthRate = pastMonthCount > 0 
        ? Math.round(((currentMonthCount - pastMonthCount) / pastMonthCount) * 100)
        : currentMonthCount > 0 ? 100 : 0;

      // カテゴリー推定（共通関数を使用）
      const category = inferSourceCategory(source.name);

      return {
        id: source.id,
        name: source.name,
        type: source.type,
        url: source.url,
        enabled: source.enabled,
        category,
        stats: {
          totalArticles,
          avgQualityScore: Math.round(avgQualityScore),
          popularTags,
          publishFrequency: Math.round(publishFrequency * 10) / 10,
          lastPublished,
          growthRate
        }
      };
    });

    // カテゴリーフィルタリング
    let filteredSources = sourcesWithStats;
    if (category) {
      filteredSources = filteredSources.filter(s => s.category === category);
    }

    // ソート（共通関数を使用）
    filteredSources = sortSources(filteredSources, sortBy, order);

      const responseTime = Date.now() - startTime;
      const response = NextResponse.json({
        sources: filteredSources,
        totalCount: filteredSources.length
      });
      response.headers.set('X-Cache-Status', 'MISS');
      response.headers.set('X-Response-Time', `${responseTime}ms`);
      response.headers.set('X-Optimization', 'standard');

      return response;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error(
      { err: error as Error, route: '/api/sources', durationMs },
      'API error'
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}