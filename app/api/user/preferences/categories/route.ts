/**
 * User Category Preferences API
 *
 * GET  /api/user/preferences/categories - Get user's category preferences
 * POST /api/user/preferences/categories - Save user's category preferences
 *
 * Both endpoints require authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma';
import { logger, sanitizeError } from '@/lib/logger';
import type {
  UserCategoryPreferences,
  UpdateCategoryPreferencesRequest,
  PreferenceScope,
} from '@/lib/personalization/types';
import {
  validateUser,
  createUserDeletedResponse,
} from '@/lib/middleware/with-user-validation';
import { handlePrismaError } from '@/lib/utils/prisma-error-handler';
import { digestService } from '@/lib/services/digest-service';

// =============================================================================
// Configuration
// =============================================================================

/** Maximum number of categories a user can select */
const MAX_CATEGORY_SELECTIONS = 20;

/** Default period in months for filtering */
const DEFAULT_PERIOD_MONTHS = 12;

// =============================================================================
// Response Types
// =============================================================================

interface PreferencesResponse extends UserCategoryPreferences {
  /** When preferences were last updated */
  updatedAt?: string;
}

interface SaveResponse {
  success: boolean;
  selectedCategories: string[];
}

interface ErrorResponse {
  error: string;
  details?: string;
  invalidCategoryIds?: string[];
}

// =============================================================================
// GET Handler
// =============================================================================

/**
 * Get user's category preferences.
 *
 * Returns empty array with default settings if user has no preferences set.
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<PreferencesResponse | ErrorResponse>> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Validate user exists and is not deleted
    const validatedUser = await validateUser(session);
    if (!validatedUser) {
      return createUserDeletedResponse() as NextResponse<ErrorResponse>;
    }

    const userId = session.user.id;

    // Parse and validate scope query parameter
    const scopeParam = request.nextUrl.searchParams.get('scope');
    const validScopes: PreferenceScope[] = ['home', 'digest'];
    if (scopeParam && !validScopes.includes(scopeParam as PreferenceScope)) {
      return NextResponse.json(
        { error: 'Invalid scope parameter' },
        { status: 400 }
      );
    }
    const scope: PreferenceScope = (scopeParam as PreferenceScope) || 'home';

    // Get user's category preferences and period setting
    const [preferences, user] = await Promise.all([
      prisma.userCategoryPreference.findMany({
        where: { userId, scope },
        select: {
          categoryId: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          personalizationPeriodMonths: true,
        },
      }),
    ]);

    const hasPreferences = preferences.length > 0;

    const response: PreferencesResponse = {
      selectedCategories: preferences.map((p) => p.categoryId),
      filterEnabled: hasPreferences, // Default to enabled if user has selections
      periodMonths: user?.personalizationPeriodMonths ?? DEFAULT_PERIOD_MONTHS,
      scope,
    };

    logger.info(
      { userId, categoryCount: preferences.length, scope },
      'User category preferences retrieved'
    );

    return NextResponse.json(response);
  } catch (error) {
    logger.error(
      { error: sanitizeError(error) },
      'Failed to get user category preferences'
    );

    return NextResponse.json(
      { error: 'Failed to retrieve preferences' },
      { status: 500 }
    );
  }
}

// =============================================================================
// POST Handler
// =============================================================================

/**
 * Save user's category preferences.
 *
 * Validates that:
 * 1. All category IDs exist in the database
 * 2. Number of selections does not exceed maximum
 * 3. Duplicate IDs are removed
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<SaveResponse | ErrorResponse>> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Validate user exists and is not deleted
    const validatedUser = await validateUser(session);
    if (!validatedUser) {
      return createUserDeletedResponse() as NextResponse<ErrorResponse>;
    }

    const userId = session.user.id;

    // Parse and validate request body
    let body: UpdateCategoryPreferencesRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { categoryIds, filterEnabled, periodMonths, scope: bodyScope } = body;

    // Validate scope if provided
    const validScopes: PreferenceScope[] = ['home', 'digest'];
    if (bodyScope && !validScopes.includes(bodyScope)) {
      return NextResponse.json(
        { error: 'Invalid scope parameter' },
        { status: 400 }
      );
    }
    const scope: PreferenceScope = bodyScope || 'home';

    // Validate categoryIds is an array
    if (!Array.isArray(categoryIds)) {
      return NextResponse.json(
        { error: 'categoryIds must be an array' },
        { status: 400 }
      );
    }

    // Remove duplicates
    const uniqueCategoryIds = [...new Set(categoryIds)];

    // Check selection limit
    if (uniqueCategoryIds.length > MAX_CATEGORY_SELECTIONS) {
      return NextResponse.json(
        {
          error: `Maximum ${MAX_CATEGORY_SELECTIONS} categories allowed`,
          details: `Received ${uniqueCategoryIds.length} categories`,
        },
        { status: 400 }
      );
    }

    // Validate all category IDs exist (if any provided)
    if (uniqueCategoryIds.length > 0) {
      const existingCategories = await prisma.interestCategory.findMany({
        where: {
          id: { in: uniqueCategoryIds },
          isActive: true,
        },
        select: { id: true },
      });

      const existingIds = new Set(existingCategories.map((c) => c.id));
      const invalidIds = uniqueCategoryIds.filter((id) => !existingIds.has(id));

      if (invalidIds.length > 0) {
        return NextResponse.json(
          {
            error: 'Invalid category IDs',
            invalidCategoryIds: invalidIds,
          },
          { status: 400 }
        );
      }
    }

    // Update preferences in a transaction
    await prisma.$transaction(async (tx) => {
      // Delete existing preferences for this scope only
      await tx.userCategoryPreference.deleteMany({
        where: { userId, scope },
      });

      // Insert new preferences with scope
      if (uniqueCategoryIds.length > 0) {
        await tx.userCategoryPreference.createMany({
          data: uniqueCategoryIds.map((categoryId) => ({
            userId,
            categoryId,
            scope,
            weight: 1, // Default weight for now
          })),
        });
      }

      // Update period months if provided (skip for digest scope)
      if (periodMonths !== undefined && scope !== 'digest') {
        await tx.user.update({
          where: { id: userId },
          data: { personalizationPeriodMonths: periodMonths },
        });
      }
    });

    // Invalidate digest cache only when digest scope changes (fire-and-forget)
    if (scope === 'digest') {
      digestService.invalidateUserCache(userId).catch((error) => {
        logger.warn({ error, userId }, 'Failed to invalidate digest cache');
      });
    }

    logger.info(
      {
        userId,
        categoryCount: uniqueCategoryIds.length,
        filterEnabled,
        periodMonths,
        scope,
      },
      'User category preferences saved'
    );

    return NextResponse.json({
      success: true,
      selectedCategories: uniqueCategoryIds,
    });
  } catch (error) {
    // Handle FK constraint violations (race condition with user deletion)
    const prismaErrorResponse = handlePrismaError(error);
    if (prismaErrorResponse) {
      return prismaErrorResponse as NextResponse<ErrorResponse>;
    }

    logger.error(
      { error: sanitizeError(error) },
      'Failed to save user category preferences'
    );

    return NextResponse.json(
      { error: 'Failed to save preferences' },
      { status: 500 }
    );
  }
}
