/**
 * User Source Presets API Route
 *
 * GET /api/user/source-presets - List user's saved presets
 * POST /api/user/source-presets - Create a new preset
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withCSRFProtection } from '@/lib/middleware/csrf-protection';
import {
  withUserValidation,
  type WithUserValidationContext,
} from '@/lib/middleware/with-user-validation';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { handlePrismaError } from '@/lib/utils/prisma-error-handler';
import logger from '@/lib/logger';

// =============================================================================
// Constants
// =============================================================================

const MAX_PRESETS_PER_USER = 10;

// =============================================================================
// Request Schemas
// =============================================================================

const CreatePresetSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(50, 'Name must be 50 characters or less')
    .transform((val) => val.trim())
    .refine((val) => val.length > 0, {
      message: 'Name cannot be whitespace only',
    }),
  sourceIds: z
    .array(z.string().min(1))
    .min(1, 'At least one source is required')
    .max(100, 'Too many sources (max 100)')
    .transform((ids) => [
      ...new Set(ids.map((id) => id.trim()).filter(Boolean)),
    ]),
});

// =============================================================================
// Handlers
// =============================================================================

async function getHandler(
  _request: NextRequest,
  context: WithUserValidationContext
) {
  try {
    const presets = await prisma.userSourcePreset.findMany({
      where: { userId: context.validatedUser.id },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return NextResponse.json({ presets });
  } catch (error) {
    const prismaResponse = handlePrismaError(error);
    if (prismaResponse) return prismaResponse;

    logger.error({ error }, 'Failed to fetch source presets');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function postHandler(
  request: NextRequest,
  context: WithUserValidationContext
) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const parseResult = CreatePresetSchema.safeParse(body);

    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const { name, sourceIds } = parseResult.data;
    const userId = context.validatedUser.id;

    // Validate sourceIds exist and are enabled (outside transaction for read-only check)
    const validSources = await prisma.source.findMany({
      where: { id: { in: sourceIds }, enabled: true },
      select: { id: true },
    });
    const validSourceIds = validSources.map((s) => s.id);
    if (validSourceIds.length === 0) {
      return NextResponse.json(
        { error: 'No valid sources provided' },
        { status: 400 }
      );
    }

    // Atomic count check + name uniqueness check + create within transaction
    try {
      const preset = await prisma.$transaction(async (tx) => {
        const existingCount = await tx.userSourcePreset.count({
          where: { userId },
        });
        if (existingCount >= MAX_PRESETS_PER_USER) {
          throw new Error('LIMIT_EXCEEDED');
        }

        const duplicate = await tx.userSourcePreset.findFirst({
          where: {
            userId,
            name: { equals: name, mode: 'insensitive' },
          },
        });
        if (duplicate) {
          throw new Error('NAME_DUPLICATE');
        }

        return tx.userSourcePreset.create({
          data: {
            userId,
            name,
            sourceIds: validSourceIds,
            sortOrder: existingCount,
          },
        });
      });

      return NextResponse.json({ preset }, { status: 201 });
    } catch (error) {
      if (error instanceof Error && error.message === 'LIMIT_EXCEEDED') {
        return NextResponse.json(
          { error: `Maximum ${MAX_PRESETS_PER_USER} presets allowed` },
          { status: 400 }
        );
      }
      if (error instanceof Error && error.message === 'NAME_DUPLICATE') {
        return NextResponse.json(
          { error: 'Preset name already exists' },
          { status: 409 }
        );
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return NextResponse.json(
          { error: 'Preset name already exists' },
          { status: 409 }
        );
      }
      throw error;
    }
  } catch (error) {
    const prismaResponse = handlePrismaError(error);
    if (prismaResponse) return prismaResponse;

    logger.error({ error }, 'Failed to create source preset');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// =============================================================================
// Export with Middleware
// =============================================================================

// GET: Auth only (CSRF not required for read operations)
export const GET = withUserValidation(getHandler);

// POST: CSRF + Auth + Rate Limit
export const POST = withCSRFProtection(
  withUserValidation(withRateLimit('write:source-preset', postHandler))
);
