import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient, Prisma } from '@prisma/client';
import { searchCache } from '@/lib/cache/search-cache';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    // クエリパラメータの取得
    const query = searchParams.get('q') || '';
    const tags = searchParams.getAll('tags');
    const sources = searchParams.getAll('sources');
    const difficulty = searchParams.getAll('difficulty');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const sortBy = searchParams.get('sortBy') || 'relevance';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // 基本的なWHERE条件
    const whereConditions: Prisma.ArticleWhereInput = {};

    // タグフィルター
    if (tags.length > 0) {
      whereConditions.tags = {
        some: {
          name: {
            in: tags
          }
        }
      };
    }

    // ソースフィルター
    if (sources.length > 0) {
      whereConditions.source = {
        name: {
          in: sources
        }
      };
    }

    // 難易度フィルター
    if (difficulty.length > 0) {
      whereConditions.difficulty = {
        in: difficulty
      };
    }

    // 期間フィルター
    if (dateFrom || dateTo) {
      whereConditions.publishedAt = {};
      if (dateFrom) {
        whereConditions.publishedAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        whereConditions.publishedAt.lte = new Date(dateTo);
      }
    }

    // キャッシュキー生成用のクエリオブジェクト
    const cacheQuery = {
      q: query,
      tags: tags.join(','),
      sources: sources.join(','),
      difficulty: difficulty.join(','),
      dateFrom,
      dateTo,
      sortBy,
      page,
      limit
    };
    
    const cacheKey = searchCache.generateQueryKey(cacheQuery);
    
    // キャッシュから取得またはDBから取得してキャッシュに保存
    const searchResult = await searchCache.getOrSet(
      cacheKey,
      async () => {
        
        let articles: ArticleWithRelations[] = [];
        let totalCount = 0;

    // 全文検索クエリがある場合
    if (query) {
      // FTS5を使用した検索
      const searchQuery = query.split(' ').map(term => `"${term}"`).join(' ');
      
      // 検索結果のIDを取得
      const searchResults = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id 
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
          },
          orderBy: sortBy === 'date' ? { publishedAt: 'desc' } :
                   sortBy === 'popularity' ? { userVotes: 'desc' } :
                   undefined
        });

        // 検索結果の順序を保持
        if (sortBy === 'relevance') {
          const idOrder = new Map(articleIds.map((id, index) => [id, index]));
          articles.sort((a, b) => (idOrder.get(a.id) || 0) - (idOrder.get(b.id) || 0));
        }
      } else {
        articles = [];
      }

      // 総件数を取得
      const countResult = await prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*) as count
        FROM articles_fts 
        WHERE articles_fts MATCH ${searchQuery}
      `;
      
      totalCount = Number(countResult[0]?.count || 0);
    } else {
      // 通常の検索（全文検索なし）
      const [articlesResult, count] = await Promise.all([
        prisma.article.findMany({
          where: whereConditions,
          include: {
            source: true,
            tags: true,
          },
          orderBy: sortBy === 'date' ? { publishedAt: 'desc' } :
                   sortBy === 'popularity' ? { userVotes: 'desc' } :
                   { publishedAt: 'desc' },
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

    // ファセット情報を取得
    const [tagFacets, sourceFacets, difficultyFacets] = await Promise.all([
      // タグのファセット
      prisma.tag.findMany({
        where: {
          articles: {
            some: whereConditions
          }
        },
        select: {
          name: true,
          _count: {
            select: {
              articles: {
                where: whereConditions
              }
            }
          }
        },
        orderBy: {
          articles: {
            _count: 'desc'
          }
        },
        take: 20
      }),
      
      // ソースのファセット
      prisma.source.findMany({
        where: {
          articles: {
            some: whereConditions
          }
        },
        select: {
          name: true,
          _count: {
            select: {
              articles: {
                where: whereConditions
              }
            }
          }
        },
        orderBy: {
          articles: {
            _count: 'desc'
          }
        }
      }),
      
      // 難易度のファセット
      prisma.$queryRaw<{ difficulty: string; count: number }[]>`
        SELECT "difficulty", COUNT(*) as count
        FROM "Article"
        WHERE "difficulty" IS NOT NULL
        GROUP BY "difficulty"
        ORDER BY count DESC
      `
    ]);

        return {
          articles,
          totalCount,
          facets: {
            tags: tagFacets.map(t => ({
              name: t.name,
              count: t._count.articles
            })),
            sources: sourceFacets.map(s => ({
              name: s.name,
              count: s._count.articles
            })),
            difficulty: difficultyFacets.filter(d => d.difficulty).map(d => ({
              level: d.difficulty,
              count: Number(d.count)
            }))
          }
        };
      }
    );

    // キャッシュ統計をログ出力
    const cacheStats = searchCache.getSearchStats();

    return NextResponse.json({
      ...searchResult,
      cache: {
        hit: cacheStats.hits > 0,
        stats: cacheStats
      }
    });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
