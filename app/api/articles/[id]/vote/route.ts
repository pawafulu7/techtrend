import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withCSRFProtection } from '@/lib/middleware/csrf-protection';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';

const articleIdSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(30)
    .regex(/^[a-z0-9]+$/i, 'Invalid article ID format'),
});

async function voteHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;

    // Validate article ID
    const validation = articleIdSchema.safeParse(resolvedParams);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid article ID', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { id } = validation.data;

    // 記事の投票数を増やす
    const article = await prisma.article.update({
      where: { id },
      data: {
        userVotes: { increment: 1 },
      },
    });

    // 品質スコアを再計算（ユーザー投票を反映）
    const articleWithDetails = await prisma.article.findUnique({
      where: { id },
      include: {
        source: true,
        tags: true,
      },
    });

    if (articleWithDetails) {
      const { calculateQualityScore } =
        await import('@/lib/utils/quality-score');
      const newScore = calculateQualityScore(articleWithDetails);

      await prisma.article.update({
        where: { id },
        data: { qualityScore: newScore },
      });
    }

    return NextResponse.json({
      success: true,
      votes: article.userVotes,
    });
  } catch (error) {
    // Handle Prisma "record not found" error
    if (
      error instanceof Error &&
      error.message.includes('Record to update not found')
    ) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to vote' }, { status: 500 });
  }
}

export const POST = withCSRFProtection(
  withRateLimit('write:vote', voteHandler)
);
