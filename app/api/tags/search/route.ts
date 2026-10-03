import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import logger from '@/lib/logger';
import { escapeLikePattern } from '@/lib/utils/like-pattern';
import { MAX_SEARCH_QUERY_LENGTH } from '@/lib/constants/search-query';

async function handler(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    // 前後の空白を除き、先頭 MAX_SEARCH_QUERY_LENGTH 文字（コードポイント単位）に切り詰める。
    // 画面の検索欄には上限がないので、400 にせず切り詰める（#684）
    const query = Array.from((searchParams.get('q') ?? '').trim())
      .slice(0, MAX_SEARCH_QUERY_LENGTH)
      .join('')
      .trimEnd();

    // 空クエリの場合は人気順で返す
    if (!query) {
      const tags = await prisma.tag.findMany({
        include: { _count: { select: { articles: true } } },
        where: { articles: { some: {} } }, // 記事があるタグのみ
        orderBy: { articles: { _count: 'desc' } },
        take: 50,
      });

      return NextResponse.json(
        tags.map((tag) => ({
          id: tag.id,
          name: tag.name,
          count: tag._count.articles,
          category: tag.category,
        }))
      );
    }

    // 検索クエリがある場合
    const tags = await prisma.tag.findMany({
      where: {
        AND: [
          // ILIKE になるので、_ や % が検索語に入ってもワイルドカードにならないようにエスケープする
          {
            name: {
              contains: escapeLikePattern(query),
              mode: 'insensitive',
            },
          },
          { articles: { some: {} } }, // 記事があるタグのみ
        ],
      },
      include: { _count: { select: { articles: true } } },
      orderBy: { articles: { _count: 'desc' } },
      take: 100, // 検索結果は最大100件
    });

    const result = tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      count: tag._count.articles,
      category: tag.category,
    }));

    return NextResponse.json(result);
  } catch (error) {
    logger.error({ error }, 'Tags search failed');
    return NextResponse.json(
      { error: 'Failed to search tags' },
      { status: 500 }
    );
  }
}

export const GET = withRateLimit('read:tags-search', handler);
