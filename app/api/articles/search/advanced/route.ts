import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { createDateRange } from '@/lib/types/prisma-helpers';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // 基本パラメータ
    const query = searchParams.get('q') || '';
    const tags = searchParams.getAll('tags');
    const sources = searchParams.getAll('sources');
    const difficulty = searchParams.getAll('difficulty');
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
    const whereConditions: Prisma.ArticleWhereInput = {};

    // テキスト検索（iLIKE）
    if (query) {
      // 除外キーワードの処理
      const queryParts = query.split(' ');
      const includeTerms: string[] = [];
      const excludeTerms: string[] = [];

      queryParts.forEach((term) => {
        if (term.startsWith('-')) {
          excludeTerms.push(term.substring(1));
        } else {
          includeTerms.push(term);
        }
      });

      const orConditions: Prisma.ArticleWhereInput[] = [];
      for (const term of includeTerms) {
        orConditions.push(
          { title: { contains: term, mode: 'insensitive' } },
          { translatedTitle: { contains: term, mode: 'insensitive' } },
          { summary: { contains: term, mode: 'insensitive' } }
        );
      }
      if (orConditions.length > 0) {
        whereConditions.OR = orConditions;
      }

      if (excludeTerms.length > 0) {
        const notConditions: Prisma.ArticleWhereInput[] = excludeTerms.flatMap(
          (term) => [
            { title: { contains: term, mode: 'insensitive' as const } },
            {
              translatedTitle: { contains: term, mode: 'insensitive' as const },
            },
          ]
        );
        whereConditions.NOT =
          notConditions.length === 1 ? notConditions[0] : { OR: notConditions };
      }
    }

    // タグフィルター（包含）
    if (tags.length > 0) {
      whereConditions.tags = {
        some: {
          name: {
            in: tags,
          },
        },
      };
    }

    // タグフィルター（除外） - テキスト検索のNOTと競合する場合はANDで結合
    if (excludeTags.length > 0) {
      const excludeTagCondition: Prisma.ArticleWhereInput = {
        tags: {
          some: {
            name: {
              in: excludeTags,
            },
          },
        },
      };
      if (whereConditions.NOT) {
        whereConditions.AND = [
          ...(Array.isArray(whereConditions.AND) ? whereConditions.AND : []),
          { NOT: whereConditions.NOT },
          { NOT: excludeTagCondition },
        ];
        delete whereConditions.NOT;
      } else {
        whereConditions.NOT = excludeTagCondition;
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

    // ソースフィルター（除外）
    if (excludeSources.length > 0) {
      const excludeSourceCondition: Prisma.ArticleWhereInput = {
        source: {
          is: {
            name: { in: excludeSources },
          },
        },
      };
      if (whereConditions.NOT) {
        if (!whereConditions.AND) whereConditions.AND = [];
        (whereConditions.AND as Prisma.ArticleWhereInput[]).push(
          { NOT: whereConditions.NOT },
          { NOT: excludeSourceCondition }
        );
        delete whereConditions.NOT;
      } else if (Array.isArray(whereConditions.AND)) {
        (whereConditions.AND as Prisma.ArticleWhereInput[]).push({
          NOT: excludeSourceCondition,
        });
      } else {
        whereConditions.NOT = excludeSourceCondition;
      }
    }

    // 難易度フィルター
    if (difficulty.length > 0) {
      whereConditions.difficulty = {
        in: difficulty,
      };
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

    // ソート条件
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
      const bookmarkCount = article._count?.favorites || 0;
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
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
