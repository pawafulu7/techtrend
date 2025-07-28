import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // 記事の投票数を増やす
    const article = await prisma.article.update({
      where: { id },
      data: {
        userVotes: { increment: 1 }
      }
    });

    // 品質スコアを再計算（ユーザー投票を反映）
    const articleWithDetails = await prisma.article.findUnique({
      where: { id },
      include: {
        source: true,
        tags: true
      }
    });

    if (articleWithDetails) {
      const { calculateQualityScore } = await import('@/lib/utils/quality-score');
      const newScore = calculateQualityScore(articleWithDetails);
      
      await prisma.article.update({
        where: { id },
        data: { qualityScore: newScore }
      });
    }

    return NextResponse.json({ 
      success: true, 
      votes: article.userVotes 
    });
  } catch (error) {
    console.error('Failed to vote:', error);
    return NextResponse.json(
      { error: 'Failed to vote' },
      { status: 500 }
    );
  }
}