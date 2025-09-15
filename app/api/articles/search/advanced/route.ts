import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

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
    const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.min(rawPage, 1000) : 1;
    const rawLimit = Number.parseInt(searchParams.get('limit') ?? '20', 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 20;
    
    // 拡張パラメータ
    const excludeTags = searchParams.get('excludeTags')?.split(',').filter(Boolean) || [];
    const excludeSources = searchParams.get('excludeSources')?.split(',').filter(Boolean) || [];
    const _qmin = Number.parseInt(searchParams.get('qualityMin') ?? '0', 10);
    const _qmax = Number.parseInt(searchParams.get('qualityMax') ?? '100', 10);
    let qualityMin = Number.isFinite(_qmin) ? Math.max(0, Math.min(100, _qmin)) : 0;
    let qualityMax = Number.isFinite(_qmax) ? Math.max(0, Math.min(100, _qmax)) : 100;
    if (qualityMin > qualityMax) [qualityMin, qualityMax] = [qualityMax, qualityMin];
    const hasContent = searchParams.get('hasContent') === 'true';
    
    const offset = (page - 1) * limit;

    // WHERE条件の構築
    const whereConditions: Prisma.ArticleWhereInput = {};

    // タグフィルター（包含）
    if (tags.length > 0) {
      whereConditions.tags = {
        some: {
          name: {
            in: tags
          }
        }
      };
    }

    // タグフィルター（除外）
    if (excludeTags.length > 0) {
      whereConditions.NOT = {
        tags: {
          some: {
            name: {
              in: excludeTags
            }
          }
        }
      };
    }

    // ソースフィルター（包含）
    if (sources.length > 0) {
      whereConditions.source = {
        is: {
          name: { in: sources }
        }
      };
    }

    // ソースフィルター（除外）
    if (excludeSources.length > 0) {
      // NOTが既に設定されている場合はAND条件で結合
      if (whereConditions.NOT) {
        whereConditions.AND = [
          { NOT: whereConditions.NOT },
          {
            NOT: {
              source: {
                name: {
                  in: excludeSources
                }
              }
            }
          }
        ];
        delete whereConditions.NOT;
      } else {
        whereConditions.NOT = {
          source: {
            is: {
              name: { in: excludeSources }
            }
          }
        };
      }
    }

    // 難易度フィルター
    if (difficulty.length > 0) {
      whereConditions.difficulty = {
        in: difficulty
      };
    }

    // 期間フィルター
    if (dateFrom || dateTo) {
      const from = dateFrom ? new Date(dateFrom) : undefined;
      const to = dateTo ? new Date(dateTo) : undefined;
      const hasFrom = from && !Number.isNaN(from.getTime());
      const hasTo = to && !Number.isNaN(to.getTime());
      if (hasFrom || hasTo) {
        whereConditions.publishedAt = {} as any;
        if (hasFrom) (whereConditions.publishedAt as any).gte = from!;
        if (hasTo) (whereConditions.publishedAt as any).lte = to!;
      }
    }

    // 品質スコアフィルター
    if (qualityMin > 0 || qualityMax < 100) {
      whereConditions.qualityScore = {
        gte: qualityMin,
        lte: qualityMax
      };
    }

    // コンテンツの有無
    if (hasContent) {
      whereConditions.content = {
        not: null
      };
    }

    type SearchArticle = Prisma.ArticleGetPayload<{
      include: { source: true; tags: true; _count: { select: { favorites: true; articleViews: true } } }
    }>;
    let articles: SearchArticle[] = [];
    let totalCount = 0;

    // 全文検索クエリがある場合
    if (query) {
      // 除外キーワードの処理
      const queryParts = query.split(' ');
      const includeTerms: string[] = [];
      const excludeTerms: string[] = [];
      
      queryParts.forEach(term => {
        if (term.startsWith('-')) {
          excludeTerms.push(term.substring(1));
        } else {
          includeTerms.push(term);
        }
      });

      // FTS5クエリの構築
      let searchQuery = includeTerms.map(term => `"${term}"`).join(' ');
      if (excludeTerms.length > 0) {
        searchQuery += ' NOT ' + excludeTerms.map(term => `"${term}"`).join(' NOT ');
      }
      
      // 検索結果のIDを取得
      const searchResults = await prisma.$queryRaw<{ id: string, rank: number }[]>`
        SELECT id, rank
        FROM articles_fts 
        WHERE articles_fts MATCH ${searchQuery}
        ORDER BY rank
        LIMIT ${limit} OFFSET ${offset}
      `;

      const articleIds = searchResults.map(r => r.id);

      // 検索結果の記事を取得
      if (articleIds.length > 0) {
        articles = await prisma.article.findMany({
          where: {
            AND: [
              { id: { in: articleIds } },
              whereConditions
            ]
          },
          include: {
            source: true,
            tags: true,
            _count: { select: { favorites: true, articleViews: true } },
          }
        });

        // ソート処理
        switch (sortBy) {
          case 'relevance':
            const idOrder = new Map(articleIds.map((id, index) => [id, index]));
            articles.sort((a, b) => (idOrder.get(a.id) || 0) - (idOrder.get(b.id) || 0));
            break;
          case 'date':
            articles.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
            break;
          case 'popularity':
            articles.sort((a, b) => (b.userVotes ?? 0) - (a.userVotes ?? 0));
            break;
          case 'quality':
            articles.sort((a, b) => b.qualityScore - a.qualityScore);
            break;
        }
      } else {
        articles = [];
      }

      // 総件数を取得
      // FTSの一致 ID を別途取得（上限ガード）し、whereConditions と組み合わせて count
      const countIds = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id
        FROM articles_fts
        WHERE articles_fts MATCH ${searchQuery}
        LIMIT 5000
      `;
      const allFtsIds = countIds.map(r => r.id);
      totalCount = allFtsIds.length > 0
        ? await prisma.article.count({ where: { AND: [ { id: { in: allFtsIds } }, whereConditions ] } })
        : 0;
    } else {
      // 通常の検索（全文検索なし）
      const orderBy = 
        sortBy === 'date' ? { publishedAt: 'desc' as const } :
        sortBy === 'popularity' ? { userVotes: 'desc' as const } :
        sortBy === 'quality' ? { qualityScore: 'desc' as const } :
        { publishedAt: 'desc' as const };

      const [articlesResult, count] = await Promise.all([
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
        prisma.article.count({
          where: whereConditions
        })
      ]);
      
      articles = articlesResult;
      totalCount = count;
    }

    // ArticleWithRelations形式に変換
     
    const articlesWithRelations = articles.map((article) => ({
      ...article,
      tags: (article.tags as Array<{ name: string }>).map(tag => tag.name),
      bookmarkCount: (article as any)._count?.favorites || 0,
      voteScore: (article as any).userVotes || 0
    }));

    // ファセット情報を取得（オプション）
    const facets = {
      tags: [],
      sources: [],
      difficulty: []
    };

    return NextResponse.json({
      articles: articlesWithRelations,
      totalCount,
      facets,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit)
      }
    });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
