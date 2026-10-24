/**
 * User Category Preferences API
 *
 * GET  /api/user/preferences/categories - Get user's category preferences
 * POST /api/user/preferences/categories - Save user's category preferences
 *
 * Both endpoints require authentication.
 *
 * 分野の設定はホームとダイジェストで共通（Issue #709）。ホームの一覧を絞り込むかどうかは
 * User.homePersonalizationEnabled に別に持つ。ダイジェストは絞り込みのオン/オフに関係なく分野を使う。
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger, sanitizeError } from '@/lib/logger';
import type {
  UserCategoryPreferences,
  UpdateCategoryPreferencesRequest,
  PeriodPreset,
} from '@/lib/personalization/types';
import {
  withUserValidation,
  type WithUserValidationContext,
} from '@/lib/middleware/with-user-validation';
import { withCSRFProtection } from '@/lib/middleware/csrf-protection';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
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
  /** 保存した後の設定（クライアントはこの値でキャッシュを置き換え、推測しない） */
  selectedCategories: string[];
  filterEnabled: boolean;
  periodMonths: number;
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
async function getHandler(
  _request: NextRequest,
  context: WithUserValidationContext
): Promise<NextResponse<PreferencesResponse | ErrorResponse>> {
  try {
    const userId = context.validatedUser.id;

    // Get user's category preferences, period setting and home filter switch
    const [preferences, user] = await Promise.all([
      prisma.userCategoryPreference.findMany({
        where: { userId },
        select: {
          categoryId: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          personalizationPeriodMonths: true,
          homePersonalizationEnabled: true,
        },
      }),
    ]);

    const hasPreferences = preferences.length > 0;

    const response: PreferencesResponse = {
      selectedCategories: preferences.map((p) => p.categoryId),
      // 分野が無ければ、オンでも絞り込めない
      filterEnabled: hasPreferences && (user?.homePersonalizationEnabled ?? false),
      periodMonths: user?.personalizationPeriodMonths ?? DEFAULT_PERIOD_MONTHS,
    };

    logger.info(
      { userId, categoryCount: preferences.length },
      'User category preferences retrieved'
    );

    return NextResponse.json(response);
  } catch (error) {
    logger.error(
      { err: sanitizeError(error) },
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
 *
 * categoryIds・filterEnabled・periodMonths は、送られたものだけを変える。ホームのスイッチだけを変えたときに、
 * 開いていた画面の古い分野で、別の画面（ダイジェスト）で変えた分野を戻さないため。
 * 分野が 0 件になったら、ホームの絞り込みはオフにする（後でダイジェストから分野を足したときに、黙って絞り込みに戻らない）
 */
async function postHandler(
  request: NextRequest,
  context: WithUserValidationContext
): Promise<NextResponse<SaveResponse | ErrorResponse>> {
  try {
    const userId = context.validatedUser.id;

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

    const { categoryIds, filterEnabled, periodMonths } = body;

    // filterEnabled is optional: omitted means "keep the current home filter switch"
    if (filterEnabled !== undefined && typeof filterEnabled !== 'boolean') {
      return NextResponse.json(
        { error: 'filterEnabled must be a boolean' },
        { status: 400 }
      );
    }

    // Validate periodMonths if provided (used by the home filter only)
    const validPeriodMonths = [
      0, 3, 6, 12,
    ] as const satisfies readonly PeriodPreset[];
    if (
      periodMonths !== undefined &&
      (typeof periodMonths !== 'number' ||
        !(validPeriodMonths as readonly number[]).includes(periodMonths))
    ) {
      return NextResponse.json(
        { error: 'periodMonths must be one of: 0, 3, 6, 12' },
        { status: 400 }
      );
    }

    // Validate categoryIds is an array of strings (optional: omitted means "keep the current categories")
    if (
      categoryIds !== undefined &&
      (!Array.isArray(categoryIds) ||
        !categoryIds.every((id: unknown) => typeof id === 'string'))
    ) {
      return NextResponse.json(
        { error: 'categoryIds must be an array of strings' },
        { status: 400 }
      );
    }

    // Remove duplicates
    const uniqueCategoryIds =
      categoryIds === undefined ? undefined : [...new Set(categoryIds)];

    // Check selection limit
    if (
      uniqueCategoryIds &&
      uniqueCategoryIds.length > MAX_CATEGORY_SELECTIONS
    ) {
      return NextResponse.json(
        {
          error: `Maximum ${MAX_CATEGORY_SELECTIONS} categories allowed`,
          details: `Received ${uniqueCategoryIds.length} categories`,
        },
        { status: 400 }
      );
    }

    // Update preferences in a transaction (includes validation to avoid race conditions)
    const saved = await prisma.$transaction(async (tx) => {
      if (uniqueCategoryIds) {
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

        // Replace the user's categories (shared by home and digest)
        await tx.userCategoryPreference.deleteMany({
          where: { userId },
        });

        if (uniqueCategoryIds.length > 0) {
          await tx.userCategoryPreference.createMany({
            data: uniqueCategoryIds.map((categoryId) => ({
              userId,
              categoryId,
              weight: 1, // Default weight for now
            })),
          });
        }
      }

      const categories =
        uniqueCategoryIds ??
        (
          await tx.userCategoryPreference.findMany({
            where: { userId },
            select: { categoryId: true },
          })
        ).map((p) => p.categoryId);

      // 分野が無ければ、ホームの絞り込みはオフにする
      const nextFilterEnabled =
        categories.length === 0 ? false : filterEnabled;
      const userData = {
        ...(nextFilterEnabled !== undefined && {
          homePersonalizationEnabled: nextFilterEnabled,
        }),
        ...(periodMonths !== undefined && {
          personalizationPeriodMonths: periodMonths,
        }),
      };
      const userSelect = {
        homePersonalizationEnabled: true,
        personalizationPeriodMonths: true,
      } as const;
      // 変えるものが無いときは update しない（updatedAt を動かさない）
      const user =
        Object.keys(userData).length > 0
          ? await tx.user.update({
              where: { id: userId },
              data: userData,
              select: userSelect,
            })
          : await tx.user.findUnique({
              where: { id: userId },
              select: userSelect,
            });

      return {
        selectedCategories: categories,
        filterEnabled:
          categories.length > 0 && (user?.homePersonalizationEnabled ?? false),
        periodMonths:
          user?.personalizationPeriodMonths ?? DEFAULT_PERIOD_MONTHS,
      };
    });

    // ダイジェストは同じ分野を読むので、保存のたびに消す。消してから応答する（応答を受けたクライアントが
    // すぐにダイジェストを取り直すので、先に応答すると消す前の古いキャッシュを読む）。
    // 消すのに失敗しても保存は済んでいるので、invalidateUserCache はログだけ出して例外を投げない
    await digestService.invalidateUserCache(userId);

    logger.info(
      {
        userId,
        categoryCount: saved.selectedCategories.length,
        filterEnabled: saved.filterEnabled,
        periodMonths: saved.periodMonths,
      },
      'User category preferences saved'
    );

    return NextResponse.json({ success: true, ...saved });
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
      { err: sanitizeError(error) },
      'Failed to save user category preferences'
    );

    return NextResponse.json(
      { error: 'Failed to save preferences' },
      { status: 500 }
    );
  }
}

export const GET = withUserValidation(getHandler);

export const POST = withCSRFProtection(
  withRateLimit('write:preferences', withUserValidation(postHandler))
);
