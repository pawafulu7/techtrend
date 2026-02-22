import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import logger from '@/lib/logger';
import { ArticleCategory, Prisma } from '@prisma/client';

const VALID_CATEGORIES = Object.values(ArticleCategory);

interface ClusterRow {
  clusterId: number;
  count: bigint;
  centroidX: number;
  centroidY: number;
  centroidZ: number;
}

async function handler(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const categoryParam = searchParams.get('category');
    const clusterParam = searchParams.get('cluster');

    // Validate category filter
    if (
      categoryParam &&
      !VALID_CATEGORIES.includes(categoryParam as ArticleCategory)
    ) {
      return NextResponse.json(
        {
          error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Validate cluster filter
    const clusterFilter =
      clusterParam !== null
        ? /^\d+$/.test(clusterParam)
          ? parseInt(clusterParam, 10)
          : NaN
        : null;
    if (
      clusterParam !== null &&
      (isNaN(clusterFilter!) || clusterFilter! < 0)
    ) {
      return NextResponse.json(
        { error: 'Invalid cluster parameter. Must be a non-negative integer.' },
        { status: 400 }
      );
    }

    // Build where clause for projections
    const where: Prisma.ArticleProjectionWhereInput = {};
    if (clusterFilter !== null) {
      where.clusterId = clusterFilter;
    }
    if (categoryParam) {
      where.article = { category: categoryParam as ArticleCategory };
    }

    // Fetch projections with article category
    const projections = await prisma.articleProjection.findMany({
      where,
      select: {
        articleId: true,
        x2d: true,
        y2d: true,
        x3d: true,
        y3d: true,
        z3d: true,
        clusterId: true,
        computedAt: true,
        article: {
          select: {
            category: true,
          },
        },
      },
    });

    const points = projections.map((p) => ({
      articleId: p.articleId,
      x2d: p.x2d,
      y2d: p.y2d,
      x3d: p.x3d,
      y3d: p.y3d,
      z3d: p.z3d,
      clusterId: p.clusterId,
      category: p.article.category ?? 'unknown',
    }));

    // Compute generatedAt as MAX(computedAt)
    const generatedAt =
      projections.length > 0
        ? new Date(
            Math.max(...projections.map((p) => p.computedAt.getTime()))
          ).toISOString()
        : new Date().toISOString();

    // Compute cluster summaries via parameterized raw query
    const clusterWhereConditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (clusterFilter !== null) {
      clusterWhereConditions.push(`ap."clusterId" = $${paramIndex}`);
      params.push(clusterFilter);
      paramIndex++;
    }
    if (categoryParam) {
      clusterWhereConditions.push(`a."category"::text = $${paramIndex}`);
      params.push(categoryParam);
      paramIndex++;
    }

    const clusterWhereClause =
      clusterWhereConditions.length > 0
        ? `WHERE ${clusterWhereConditions.join(' AND ')}`
        : '';

    const clusters = await prisma.$queryRawUnsafe<ClusterRow[]>(
      `SELECT
        ap."clusterId" AS "clusterId",
        COUNT(*)::bigint AS "count",
        AVG(ap."x3d")::float AS "centroidX",
        AVG(ap."y3d")::float AS "centroidY",
        AVG(ap."z3d")::float AS "centroidZ"
      FROM "ArticleProjection" ap
      JOIN "Article" a ON a."id" = ap."articleId"
      ${clusterWhereClause}
      GROUP BY ap."clusterId"
      ORDER BY ap."clusterId"`,
      ...params
    );

    const response = NextResponse.json({
      points,
      clusters: clusters.map((c) => ({
        id: c.clusterId,
        count: Number(c.count),
        centroidX: c.centroidX,
        centroidY: c.centroidY,
        centroidZ: c.centroidZ,
      })),
      totalCount: points.length,
      generatedAt,
    });

    response.headers.set(
      'Cache-Control',
      'public, s-maxage=3600, stale-while-revalidate=7200'
    );

    return response;
  } catch (error) {
    logger.error({ error }, 'Semantic Atlas API error');
    return NextResponse.json(
      { error: 'Failed to fetch semantic atlas data' },
      { status: 500 }
    );
  }
}

export const GET = withRateLimit('read:semantic-atlas', handler);
