import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseIntParam, VALIDATION_RANGES } from '@/lib/utils/validation';
import logger from '@/lib/logger';
import { findNewTags } from '@/lib/database/new-tags';
import { daysAgo } from '@/lib/database/article-aggregation-filter';

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

    const now = new Date();
    const rows = await findNewTags(prisma, {
      from: daysAgo(days, now),
      to: now,
    });
    const tags = rows.map((tag) => ({
      id: tag.id,
      name: tag.name,
      articleCount: tag.count,
    }));

    return NextResponse.json({
      count: tags.length,
      tags,
    });
  } catch (error) {
    logger.error({ err: error }, 'Tags new GET failed');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
