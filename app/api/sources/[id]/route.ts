import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';

const idSchema = z.string().trim().min(1).max(100);

interface Params {
  params: Promise<{
    id: string;
  }>;
}

async function handler(request: NextRequest, { params }: Params) {
  const startTime = Date.now();

  try {
    const { id: rawId } = await params;

    // idバリデーション
    const idParseResult = idSchema.safeParse(rawId);
    if (!idParseResult.success) {
      return NextResponse.json(
        { error: 'Bad Request', details: idParseResult.error.flatten() },
        { status: 400 }
      );
    }
    const id = idParseResult.data;

    // ソース情報を先に取得して404を早期リターン
    const source = await prisma.source.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            articles: true,
          },
        },
      },
    });

    // ソースが見つからない場合は早期リターン
    if (!source) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    // 残りのクエリを並列化（DB集約を使用してメモリ効率化）
    const [
      articleAgg,
      recentArticlesCount,
      recentArticles,
      topArticles,
      tagDistribution,
    ] = await Promise.all([
      // 統計情報をDB側で集約
      prisma.article.aggregate({
        where: { sourceId: id },
        _count: { _all: true },
        _avg: { qualityScore: true, bookmarks: true },
      }),

      // 30日以内の記事数をカウント
      prisma.article.count({
        where: {
          sourceId: id,
          publishedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),

      // 最新記事（必要なフィールドのみ選択）
      prisma.article.findMany({
        where: { sourceId: id },
        select: {
          id: true,
          title: true,
          url: true,
          summary: true,
          thumbnail: true,
          publishedAt: true,
          qualityScore: true,
          bookmarks: true,
          tags: { select: { id: true, name: true } },
        },
        orderBy: {
          publishedAt: 'desc',
        },
        take: 10,
      }),

      // 人気記事（安定したソート）
      prisma.article.findMany({
        where: { sourceId: id },
        select: {
          id: true,
          title: true,
          url: true,
          summary: true,
          thumbnail: true,
          publishedAt: true,
          qualityScore: true,
          bookmarks: true,
          tags: { select: { id: true, name: true } },
        },
        orderBy: [
          { bookmarks: 'desc' },
          { publishedAt: 'desc' }, // タイブレーカーとして使用
        ],
        take: 5,
      }),

      // タグ分布
      prisma.$queryRaw<Array<{ name: string; count: bigint }>>`
        SELECT t.name, COUNT(*)::bigint AS count
        FROM "Tag" t
        INNER JOIN "_ArticleToTag" at ON t.id = at."B"
        INNER JOIN "Article" a ON at."A" = a.id
        WHERE a."sourceId" = ${id}
        GROUP BY t.name
        ORDER BY count DESC
        LIMIT 20
      `,
    ]);

    // 統計計算（DB集約結果を使用）
    const totalArticles = articleAgg._count._all;
    const avgQualityScore = Number(articleAgg._avg.qualityScore ?? 0);
    const avgBookmarks = Number(articleAgg._avg.bookmarks ?? 0);
    const publishFrequency = recentArticlesCount / 30;

    // 最終投稿日（最新記事から取得）
    const lastPublished =
      recentArticles.length > 0 ? recentArticles[0].publishedAt : null;

    // タグ分布をオブジェクトに変換
    const tagDistributionObj = tagDistribution.reduce(
      (acc, tag) => {
        acc[tag.name] = Number(tag.count);
        return acc;
      },
      {} as Record<string, number>
    );

    const responseTime = Date.now() - startTime;
    const response = NextResponse.json({
      source,
      stats: {
        totalArticles,
        avgQualityScore: Math.round(avgQualityScore),
        avgBookmarks: Math.round(avgBookmarks),
        publishFrequency: Math.round(publishFrequency * 10) / 10,
        lastPublished: lastPublished ? new Date(lastPublished) : null,
      },
      recentArticles,
      topArticles,
      tagDistribution: tagDistributionObj,
    });

    // パフォーマンスメトリクスをヘッダーに追加
    response.headers.set('X-Response-Time', `${responseTime}ms`);
    response.headers.set('X-Query-Strategy', 'parallel');

    return response;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error(
      { err: error as Error, route: '/api/sources/[id]', durationMs },
      'API error'
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withAdminAuth(withRateLimit('admin:read', handler));
