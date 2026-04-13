/**
 * User Source Presets [id] API Route
 *
 * PUT /api/user/source-presets/[id] - Update a preset
 * DELETE /api/user/source-presets/[id] - Delete a preset
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@/lib/prisma-exports';
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
// Types
// =============================================================================

interface RouteContext extends WithUserValidationContext {
  params: Promise<{ id: string }>;
}

// =============================================================================
// Request Schemas
// =============================================================================

const UpdatePresetSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(50, 'Name must be 50 characters or less')
    .transform((val) => val.trim())
    .refine((val) => val.length > 0, {
      message: 'Name cannot be whitespace only',
    })
    .optional(),
  sourceIds: z
    .array(z.string().min(1))
    .min(1, 'At least one source is required')
    .max(100, 'Too many sources (max 100)')
    .transform((ids) => [
      ...new Set(ids.map((id) => id.trim()).filter(Boolean)),
    ])
    .optional(),
  sortOrder: z.number().int().min(0).optional(),
});

// =============================================================================
// Handlers
// =============================================================================

async function putHandler(request: NextRequest, context: RouteContext) {
  try {
    const { id: presetId } = await context.params;
    const userId = context.validatedUser.id;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const parseResult = UpdatePresetSchema.safeParse(body);

    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const { name, sourceIds, sortOrder } = parseResult.data;

    // IDOR protection: only find preset owned by this user
    const existingPreset = await prisma.userSourcePreset.findFirst({
      where: { id: presetId, userId },
    });
    if (!existingPreset) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
    }

    // Validate name uniqueness if name is being changed
    if (name && name.toLowerCase() !== existingPreset.name.toLowerCase()) {
      const duplicate = await prisma.userSourcePreset.findFirst({
        where: {
          userId,
          name: { equals: name, mode: 'insensitive' },
          id: { not: presetId },
        },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: 'Preset name already exists' },
          { status: 409 }
        );
      }
    }

    // Validate sourceIds if provided
    let validSourceIds: string[] | undefined;
    if (sourceIds) {
      const validSources = await prisma.source.findMany({
        where: { id: { in: sourceIds }, enabled: true },
        select: { id: true },
      });
      validSourceIds = validSources.map((s) => s.id);
      if (validSourceIds.length === 0) {
        return NextResponse.json(
          { error: 'No valid sources provided' },
          { status: 400 }
        );
      }
    }

    // Build update data
    const updateData: Prisma.UserSourcePresetUpdateInput = {};
    if (name !== undefined) updateData.name = name;
    if (validSourceIds !== undefined) updateData.sourceIds = validSourceIds;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

    try {
      const preset = await prisma.userSourcePreset.update({
        where: { id: presetId, userId },
        data: updateData,
      });

      return NextResponse.json({ preset });
    } catch (error) {
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

    logger.error({ error }, 'Failed to update source preset');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function deleteHandler(_request: NextRequest, context: RouteContext) {
  try {
    const { id: presetId } = await context.params;
    const userId = context.validatedUser.id;

    // IDOR protection: only delete preset owned by this user
    const existing = await prisma.userSourcePreset.findFirst({
      where: { id: presetId, userId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
    }

    await prisma.userSourcePreset.delete({
      where: { id: presetId, userId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const prismaResponse = handlePrismaError(error);
    if (prismaResponse) return prismaResponse;

    logger.error({ error }, 'Failed to delete source preset');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// =============================================================================
// Export with Middleware
// =============================================================================

// PUT: CSRF + Rate Limit + Auth
export const PUT = withCSRFProtection(
  withRateLimit('write:source-preset', withUserValidation(putHandler))
);

// DELETE: CSRF + Rate Limit + Auth
export const DELETE = withCSRFProtection(
  withRateLimit('write:source-preset', withUserValidation(deleteHandler))
);
