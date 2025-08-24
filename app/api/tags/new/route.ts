import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { parseIntParam, VALIDATION_RANGES } from '@/lib/utils/validation';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    // Validate days parameter (for tags, use more restrictive range)
    const daysParam = parseIntParam(
      searchParams.get('days'),
      7,
      {
        min: VALIDATION_RANGES.tagDays.min,
        max: VALIDATION_RANGES.tagDays.max,
        paramName: 'days'
      }
    );
    
    // Return error if validation failed
    if (daysParam.error) {
      return NextResponse.json(
        { error: daysParam.error },
        { status: 400 }
      );
    }
    
    const days = daysParam.value;
    
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
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}