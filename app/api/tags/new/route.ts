import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '7');
    
    const since = new Date();
    since.setDate(since.getDate() - days);
    
    // 最近作成されたタグを取得
    // 注: Prismaではタグの作成日時を追跡していないため、
    // 最近の記事で初めて使用されたタグを新規タグとみなす
    const newTags = await prisma.tag.findMany({
      where: {
        articles: {
          some: {
            publishedAt: {
              gte: since
            }
          }
        }
      },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            articles: true
          }
        }
      },
      orderBy: {
        articles: {
          _count: 'desc'
        }
      }
    });
    
    // 古い記事でも使用されているタグを除外
    const oldTags = await prisma.tag.findMany({
      where: {
        articles: {
          some: {
            publishedAt: {
              lt: since
            }
          }
        }
      },
      select: {
        id: true
      }
    });
    
    const oldTagIds = new Set(oldTags.map(t => t.id));
    const trulyNewTags = newTags.filter(t => !oldTagIds.has(t.id));
    
    return NextResponse.json({
      count: trulyNewTags.length,
      tags: trulyNewTags
    });
  } catch (error) {
    console.error('New tags error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}