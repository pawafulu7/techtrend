import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseIntParam, VALIDATION_RANGES } from '@/lib/utils/validation';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Validate days parameter (for tags, use more restrictive range)
    const daysParam = parseIntParam(searchParams.get('days'), 7, {
      min: VALIDATION_RANGES.tagDays.min,
      max: VALIDATION_RANGES.tagDays.max,
      paramName: 'days',
    });

    // Return error if validation failed
    if (daysParam.error) {
      return NextResponse.json({ error: daysParam.error }, { status: 400 });
    }

    const days = daysParam.value;

    const since = new Date();
    since.setDate(since.getDate() - days);

    // 最近の記事で初めて使用されたタグを取得（NOT EXISTSで古い記事に出現するタグを除外）
    // 注: Prismaではタグの作成日時を追跡していないため、
    // 最近の記事のみで使用されたタグを新規タグとみなす
    const sinceIso = since.toISOString();
    const rawTags = await prisma.$queryRaw<
      Array<{ id: string; name: string; article_count: bigint }>
    >`
      SELECT
        t.id,
        t.name,
        COUNT(DISTINCT a.id) AS article_count
      FROM "Tag" t
      JOIN "_ArticleToTag" at ON t.id = at."B"
      JOIN "Article" a ON at."A" = a.id
      WHERE a."publishedAt" >= ${sinceIso}::timestamp
        AND t.name <> ''
        AND t.name IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM "_ArticleToTag" at2
          JOIN "Article" a2 ON at2."A" = a2.id
          WHERE at2."B" = t.id
            AND a2."publishedAt" < ${sinceIso}::timestamp
        )
      GROUP BY t.id, t.name
      ORDER BY article_count DESC
    `;

    const tags = rawTags.map((t) => ({
      id: t.id,
      name: t.name,
      articleCount: Number(t.article_count),
    }));

    return NextResponse.json({
      count: tags.length,
      tags,
    });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
