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
  PeriodPreset,
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

/** Valid preference scopes */
const validScopes: PreferenceScope[] = ['home', 'digest'];

// =============================================================================
// Errors
// =============================================================================

/** Error thrown inside transaction when invalid category IDs are detected */
class InvalidCategoryError extends Error {
  constructor(public readonly invalidIds: string[]) {
    super('Invalid category IDs');
    this.name = 'InvalidCategoryError';
  }
}

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
    if (
      scopeParam !== null &&
      !validScopes.includes(scopeParam as PreferenceScope)
    ) {
      return NextResponse.json(
        { error: 'Invalid scope parameter' },
        { status: 400 }
      );
    }
    const scope: PreferenceScope =
      scopeParam === null ? 'home' : (scopeParam as PreferenceScope);

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
    let parsedBody: unknown;
    try {
      parsedBody = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (
      parsedBody === null ||
      typeof parsedBody !== 'object' ||
      Array.isArray(parsedBody)
    ) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const body = parsedBody as UpdateCategoryPreferencesRequest;

    const { categoryIds, filterEnabled, periodMonths, scope: bodyScope } = body;

    // Validate scope if provided (must be a string and one of the valid scopes)
    if (
      bodyScope !== undefined &&
      (typeof bodyScope !== 'string' ||
        !validScopes.includes(bodyScope as PreferenceScope))
    ) {
      return NextResponse.json(
        { error: 'Invalid scope parameter' },
        { status: 400 }
      );
    }
    const scope: PreferenceScope = (bodyScope as PreferenceScope) || 'home';

    // Validate periodMonths if provided (only relevant for home scope)
    const validPeriodMonths = [
      0, 3, 6, 12,
    ] as const satisfies readonly PeriodPreset[];
    if (
      periodMonths !== undefined &&
      scope !== 'digest' &&
      (typeof periodMonths !== 'number' ||
        !(validPeriodMonths as readonly number[]).includes(periodMonths))
    ) {
      return NextResponse.json(
        { error: 'periodMonths must be one of: 0, 3, 6, 12' },
        { status: 400 }
      );
    }

    // Validate categoryIds is an array of strings
    if (
      !Array.isArray(categoryIds) ||
      !categoryIds.every((id: unknown) => typeof id === 'string')
    ) {
      return NextResponse.json(
        { error: 'categoryIds must be an array of strings' },
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

    // Update preferences in a transaction (includes validation to avoid race conditions)
    await prisma.$transaction(async (tx) => {
      // Validate all category IDs exist (if any provided)
      if (uniqueCategoryIds.length > 0) {
        const existingCategories = await tx.interestCategory.findMany({
          where: {
            id: { in: uniqueCategoryIds },
            isActive: true,
          },
          select: { id: true },
        });

        const existingIds = new Set(existingCategories.map((c) => c.id));
        const invalidIds = uniqueCategoryIds.filter(
          (id) => !existingIds.has(id)
        );

        if (invalidIds.length > 0) {
          throw new InvalidCategoryError(invalidIds);
        }
      }

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

      // Warn if periodMonths is sent for digest scope (silently ignored)
      if (periodMonths !== undefined && scope === 'digest') {
        logger.warn(
          { userId, scope, periodMonths },
          'periodMonths ignored for digest scope'
        );
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
    // Handle invalid category IDs thrown from within the transaction
    if (error instanceof InvalidCategoryError) {
      return NextResponse.json(
        {
          error: 'Invalid category IDs',
          invalidCategoryIds: error.invalidIds,
        },
        { status: 400 }
      );
    }

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
