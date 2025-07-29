import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period') || '30d';
    const limit = parseInt(searchParams.get('limit') || '50');

    // 期間に基づいてフィルタリング
    let dateFilter = {};
    if (period !== 'all') {
      const days = period === '7d' ? 7 : period === '30d' ? 30 : 365;
      const since = new Date();
      since.setDate(since.getDate() - days);
      
      dateFilter = {
        articles: {
          some: {
            publishedAt: {
              gte: since
            }
          }
        }
      };
    }

    // タグの使用回数を取得
    const tags = await prisma.tag.findMany({
      where: dateFilter,
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            articles: {
              where: period !== 'all' ? {
                publishedAt: dateFilter.articles?.some?.publishedAt
              } : undefined
            }
          }
        }
      },
      orderBy: {
        articles: {
          _count: 'desc'
        }
      },
      take: limit
    });

    // トレンド計算のために前期間のデータも取得
    let previousPeriodCounts: Record<string, number> = {};
    if (period !== 'all') {
      const days = period === '7d' ? 7 : period === '30d' ? 30 : 365;
      const previousStart = new Date();
      previousStart.setDate(previousStart.getDate() - days * 2);
      const previousEnd = new Date();
      previousEnd.setDate(previousEnd.getDate() - days);

      const previousTags = await prisma.tag.findMany({
        where: {
          id: {
            in: tags.map(t => t.id)
          },
          articles: {
            some: {
              publishedAt: {
                gte: previousStart,
                lt: previousEnd
              }
            }
          }
        },
        select: {
          id: true,
          _count: {
            select: {
              articles: {
                where: {
                  publishedAt: {
                    gte: previousStart,
                    lt: previousEnd
                  }
                }
              }
            }
          }
        }
      });

      previousPeriodCounts = previousTags.reduce((acc, tag) => {
        acc[tag.id] = tag._count.articles;
        return acc;
      }, {} as Record<string, number>);
    }

    // レスポンスの構築
    const tagCloudData = tags.map(tag => {
      const currentCount = tag._count.articles;
      const previousCount = previousPeriodCounts[tag.id] || 0;
      
      let trend: 'rising' | 'stable' | 'falling' = 'stable';
      if (period !== 'all') {
        if (currentCount > previousCount * 1.2) {
          trend = 'rising';
        } else if (currentCount < previousCount * 0.8) {
          trend = 'falling';
        }
      }

      return {
        id: tag.id,
        name: tag.name,
        count: currentCount,
        trend
      };
    });

    return NextResponse.json({
      tags: tagCloudData,
      period
    });
  } catch (error) {
    console.error('Tag cloud error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}