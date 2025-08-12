import { NextRequest } from 'next/server';
import { prisma } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q') || '';
    
    console.log('[Tag Search API] Query:', query);
    
    // 空クエリの場合は人気順で返す
    if (!query) {
      const tags = await prisma.tag.findMany({
        include: { _count: { select: { articles: true } } },
        where: { articles: { some: {} } }, // 記事があるタグのみ
        orderBy: { articles: { _count: 'desc' } },
        take: 50,
      });
      
      console.log('[Tag Search API] Found tags (no query):', tags.length);
      
      return Response.json(tags.map(tag => ({
        id: tag.id,
        name: tag.name,
        count: tag._count.articles,
        category: tag.category,
      })));
    }
    
    // 検索クエリがある場合
    const tags = await prisma.tag.findMany({
      where: {
        AND: [
          { name: { contains: query } }, // mode: 'insensitive' を削除（SQLiteでの互換性問題の可能性）
          { articles: { some: {} } }, // 記事があるタグのみ
        ],
      },
      include: { _count: { select: { articles: true } } },
      orderBy: { articles: { _count: 'desc' } },
      take: 100, // 検索結果は最大100件
    });
    
    console.log('[Tag Search API] Found tags with query:', tags.length);
    
    const result = tags.map(tag => ({
      id: tag.id,
      name: tag.name,
      count: tag._count.articles,
      category: tag.category,
    }));
    
    return Response.json(result);
  } catch (error) {
    console.error('Tag search API error:', error);
    return Response.json(
      { error: 'Failed to search tags' },
      { status: 500 }
    );
  }
}