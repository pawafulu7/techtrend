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
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    
    // 拡張パラメータ
    const excludeTags = searchParams.get('excludeTags')?.split(',').filter(Boolean) || [];
    const excludeSources = searchParams.get('excludeSources')?.split(',').filter(Boolean) || [];
    const qualityMin = parseInt(searchParams.get('qualityMin') || '0');
    const qualityMax = parseInt(searchParams.get('qualityMax') || '100');
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
        name: {
          in: sources
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
            name: {
              in: excludeSources
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
      whereConditions.publishedAt = {};
      if (dateFrom) {
        whereConditions.publishedAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        whereConditions.publishedAt.lte = new Date(dateTo);
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

    let articles: Array<{
      id: string;
      publishedAt: Date;
      qualityScore: number;
      source: unknown;
      tags: unknown[];
      [key: string]: unknown;
    }> = [];
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
            articles.sort((a, b) => {
              const bWithBookmarks = b as typeof b & { bookmarks?: number };
              const aWithBookmarks = a as typeof a & { bookmarks?: number };
              return (bWithBookmarks.bookmarks ?? 0) - (aWithBookmarks.bookmarks ?? 0);
            });
            break;
          case 'quality':
            articles.sort((a, b) => b.qualityScore - a.qualityScore);
            break;
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
      tags: article.tags.map((tag) => typeof tag === 'string' ? tag : tag.name),
      bookmarkCount: article._count?.readingList || 0,
      voteScore: article._count?.votes || 0
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