import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import logger from '@/lib/logger';
import { findTopTags } from '@/lib/database/tag-article-counts';
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

    // 記事数の多い順。記事数は無効化したソースの記事を数えず、記事が 0 件のタグは返さない（issue #688）。
    // 空クエリは人気順の上位 50 件、検索は名前の部分一致で最大 100 件。
    // 部分一致は ILIKE で、_ や % が検索語に入ってもワイルドカードにならないように findTopTags がエスケープする
    const tags = query
      ? await findTopTags(prisma, { limit: 100, nameContains: query })
      : await findTopTags(prisma, { limit: 50 });

    const result = tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      count: tag.count,
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
