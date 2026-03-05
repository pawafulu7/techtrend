import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { prisma } from '@/lib/database';

async function handler(_request: NextRequest) {
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const jstNow = new Date(now.getTime() + jstOffset);
  const jstToday = new Date(
    Date.UTC(
      jstNow.getUTCFullYear(),
      jstNow.getUTCMonth(),
      jstNow.getUTCDate()
    ) - jstOffset
  );

  const [articleCount, sourceCount, userCount, todayArticleCount] =
    await Promise.all([
      prisma.article.count(),
      prisma.source.count({ where: { enabled: true } }),
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.article.count({ where: { publishedAt: { gte: jstToday } } }),
    ]);

  return NextResponse.json({
    articleCount,
    sourceCount,
    userCount,
    todayArticleCount,
  });
}

export const GET = withAdminAuth(withRateLimit('admin:read', handler));
