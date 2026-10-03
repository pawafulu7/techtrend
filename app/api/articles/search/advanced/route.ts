import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@/lib/prisma-exports';
import { prisma } from '@/lib/prisma';
import { enabledSourceWhere } from '@/lib/database/enabled-source-filter';
import { createDateRange } from '@/lib/types/prisma-helpers';
import logger from '@/lib/logger';
import { escapeLikePattern } from '@/lib/utils/like-pattern';
import { findTagIdsByNames } from '@/lib/services/tag-service';
import {
  splitSearchKeywords,
  validateSearchQuery,
} from '@/app/api/articles/lib/where-clause-predicates';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // 基本パラメータ
    const query = searchParams.get('q') || '';
    // 検索語の長さと語数を検証する（語ごとに ILIKE の条件が増えるため、条件を作る前に）
    const queryError = validateSearchQuery(query);
    if (queryError) {
      return NextResponse.json({ error: queryError }, { status: 400 });
    }
    const tags = searchParams.getAll('tags');
    const sources = searchParams.getAll('sources');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const sortBy = searchParams.get('sortBy') || 'relevance';
    const rawPage = Number.parseInt(searchParams.get('page') ?? '1', 10);
    const page =
      Number.isFinite(rawPage) && rawPage > 0 ? Math.min(rawPage, 1000) : 1;
    const rawLimit = Number.parseInt(searchParams.get('limit') ?? '20', 10);
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 20;

    // 拡張パラメータ
    const excludeTags =
      searchParams.get('excludeTags')?.split(',').filter(Boolean) || [];
    const excludeSources =
      searchParams.get('excludeSources')?.split(',').filter(Boolean) || [];
    const _qmin = Number.parseInt(searchParams.get('qualityMin') ?? '0', 10);
    const _qmax = Number.parseInt(searchParams.get('qualityMax') ?? '100', 10);
    let qualityMin = Number.isFinite(_qmin)
      ? Math.max(0, Math.min(100, _qmin))
      : 0;
    let qualityMax = Number.isFinite(_qmax)
      ? Math.max(0, Math.min(100, _qmax))
      : 100;
    if (qualityMin > qualityMax)
      [qualityMin, qualityMax] = [qualityMax, qualityMin];
    const hasContent = searchParams.get('hasContent') === 'true';

    const offset = (page - 1) * limit;

    // WHERE条件の構築
    const whereConditions: Prisma.ArticleWhereInput = {
      isHidden: false,
      // 無効化したソースの記事を除く（issue #688）。ソースの指定は下で whereConditions.source に
      // 入るので、ぶつからないよう AND の配列に入れる
      AND: [enabledSourceWhere()],
    };

    // テキスト検索（iLIKE）
    // 語の区切り方は検証（validateSearchQuery）と同じにする。半角スペースだけで区切ると、
    // タブや全角スペースだけの語が検証では数えられずに上限をすり抜ける
    const queryParts = splitSearchKeywords(query);
    if (queryParts.length > 0) {
      // 除外キーワードの処理
      const includeTerms: string[] = [];
      const excludeTerms: string[] = [];

      queryParts.forEach((term) => {
        if (term.startsWith('-')) {
          const stripped = term.substring(1);
          if (stripped) excludeTerms.push(stripped);
        } else {
          includeTerms.push(term);
        }
      });

      // 1 語がタイトル/翻訳タイトル/要約のいずれかに含まれる条件。
      // contains は ILIKE になるので、_ や % がワイルドカードにならないようにエスケープする
      const matchTerm = (term: string): Prisma.ArticleWhereInput[] => {
        const pattern = escapeLikePattern(term);
        return [
          { title: { contains: pattern, mode: 'insensitive' } },
          { translatedTitle: { contains: pattern, mode: 'insensitive' } },
          { summary: { contains: pattern, mode: 'insensitive' } },
        ];
      };

      // 1 語がタイトル/翻訳タイトル/要約のどれにも含まれない条件。
      // NOT (a OR b OR c) は、translatedTitle や summary が NULL だと NULL になって
      // 記事ごと落ちる（除外語を 1 つ付けただけで約半数が消えていた）。NULL の列は
      // 「含まない」として扱う
      const excludeTerm = (term: string): Prisma.ArticleWhereInput[] => {
        const pattern = escapeLikePattern(term);
        return [
          { NOT: { title: { contains: pattern, mode: 'insensitive' } } },
          {
            OR: [
              { translatedTitle: null },
              {
                NOT: {
                  translatedTitle: { contains: pattern, mode: 'insensitive' },
                },
              },
            ],
          },
          {
            OR: [
              { summary: null },
              { NOT: { summary: { contains: pattern, mode: 'insensitive' } } },
            ],
          },
        ];
      };

      // 各検索語はAND（全てを含む）、各語はタイトル/翻訳タイトル/要約のいずれかにマッチ
      if (includeTerms.length > 0) {
        const termConditions = includeTerms.map((term) => ({
          OR: matchTerm(term),
        }));
        whereConditions.AND = [
          ...(Array.isArray(whereConditions.AND) ? whereConditions.AND : []),
          ...termConditions,
        ];
      }

      if (excludeTerms.length > 0) {
        if (!Array.isArray(whereConditions.AND)) whereConditions.AND = [];
        for (const term of excludeTerms) {
          (whereConditions.AND as Prisma.ArticleWhereInput[]).push(
            ...excludeTerm(term)
          );
        }
      }
    }

    // タグ名は大文字小文字を区別せずに照合する（タグの同一性のキーは lower(name)。#672）。
    // lower() で ID を引いてから ID で絞る（Prisma の insensitive は ILIKE になり、
    // タグ名の _ や % がワイルドカードとして効くため）
    // タグフィルター（包含）。当たるタグが無ければ 0 件になる
    if (tags.length > 0) {
      const tagIds = await findTagIdsByNames(tags);
      whereConditions.tags = { some: { id: { in: tagIds } } };
    }

    // タグフィルター（除外） - AND配列で統一的に結合
    if (excludeTags.length > 0) {
      const excludeTagIds = await findTagIdsByNames(excludeTags);
      if (excludeTagIds.length > 0) {
        if (!Array.isArray(whereConditions.AND)) whereConditions.AND = [];
        (whereConditions.AND as Prisma.ArticleWhereInput[]).push({
          NOT: { tags: { some: { id: { in: excludeTagIds } } } },
        });
      }
    }

    // ソースフィルター（包含）
    if (sources.length > 0) {
      whereConditions.source = {
        is: {
          name: { in: sources },
        },
      };
    }

    // ソースフィルター（除外） - AND配列で統一的に結合
    if (excludeSources.length > 0) {
      if (!Array.isArray(whereConditions.AND)) whereConditions.AND = [];
      (whereConditions.AND as Prisma.ArticleWhereInput[]).push({
        NOT: { source: { is: { name: { in: excludeSources } } } },
      });
    }

    // 期間フィルター
    if (dateFrom || dateTo) {
      const from = dateFrom ? new Date(dateFrom) : undefined;
      const to = dateTo ? new Date(dateTo) : undefined;
      const dateRange = createDateRange(from, to);
      if (dateRange) {
        whereConditions.publishedAt = dateRange;
      }
    }

    // 品質スコアフィルター
    if (qualityMin > 0 || qualityMax < 100) {
      whereConditions.qualityScore = {
        gte: qualityMin,
        lte: qualityMax,
      };
    }

    // コンテンツの有無
    if (hasContent) {
      whereConditions.content = {
        not: null,
      };
    }

    // ソート条件（relevanceはiLIKE検索のため日付順にフォールバック）
    const orderBy =
      sortBy === 'date'
        ? { publishedAt: 'desc' as const }
        : sortBy === 'popularity'
          ? { userVotes: 'desc' as const }
          : sortBy === 'quality'
            ? { qualityScore: 'desc' as const }
            : { publishedAt: 'desc' as const };

    const [totalCount, articles] = await prisma.$transaction([
      prisma.article.count({ where: whereConditions }),
      prisma.article.findMany({
        where: whereConditions,
        omit: {
          content: true,
          detailedSummary: true,
        },
        include: {
          source: true,
          tags: true,
          _count: { select: { favorites: true, articleViews: true } },
        },
        orderBy,
        skip: offset,
        take: limit,
      }),
    ]);

    // ArticleWithRelations形式に変換
    const articlesWithRelations = articles.map((article) => {
      const bookmarkCount = article._count?.favorites ?? 0;
      const voteScore = article.userVotes ?? 0;

      return {
        ...article,
        tags: (article.tags as Array<{ name: string }>).map((tag) => tag.name),
        bookmarkCount,
        voteScore,
      };
    });

    // ファセット情報（オプション）
    const facets = {
      tags: [],
      sources: [],
      // 難易度機能は廃止済み。レスポンスの形を保つため空配列を返す
      difficulty: [],
    };

    return NextResponse.json({
      articles: articlesWithRelations,
      totalCount,
      facets,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Advanced search failed');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
