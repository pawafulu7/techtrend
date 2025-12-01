/**
 * Interest Categories API
 *
 * GET /api/interest-categories - Get all active interest categories
 *
 * This endpoint is public (no authentication required) as category information
 * is not user-specific and can be cached.
 */

import { NextResponse } from 'next/server';
import { categoryFilterService } from '@/lib/personalization/category-filter-service';
import { logger, sanitizeError } from '@/lib/logger';
import type { InterestCategoryWithCount } from '@/lib/personalization/types';

// =============================================================================
// Response Types
// =============================================================================

interface CategoriesResponse {
  categories: InterestCategoryWithCount[];
  /** Cache hint for clients (seconds) */
  cacheMaxAge: number;
}

interface ErrorResponse {
  error: string;
  details?: string;
}

// =============================================================================
// GET Handler
// =============================================================================

/**
 * Get all active interest categories.
 *
 * Response is cacheable for 5 minutes as category data changes infrequently.
 */
export async function GET(): Promise<NextResponse<CategoriesResponse | ErrorResponse>> {
  try {
    const categories = await categoryFilterService.getActiveCategories();

    logger.info(
      { categoryCount: categories.length },
      'Interest categories retrieved'
    );

    const response: CategoriesResponse = {
      categories,
      cacheMaxAge: 300, // 5 minutes
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    logger.error(
      { error: sanitizeError(error) },
      'Failed to get interest categories'
    );

    return NextResponse.json(
      { error: 'Failed to retrieve categories' },
      { status: 500 }
    );
  }
}
