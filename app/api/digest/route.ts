/**
 * Digest API Route
 *
 * GET /api/digest - Get personalized digest
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  withUserValidation,
  type WithUserValidationContext,
} from '@/lib/middleware/with-user-validation';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { digestService } from '@/lib/services/digest-service';

// =============================================================================
// Request Schema
// =============================================================================

const DigestQuerySchema = z.object({
  period: z.enum(['daily', 'weekly']).default('daily'),
});

// =============================================================================
// Handler
// =============================================================================

/**
 * GET /api/digest
 *
 * Returns a personalized digest for the authenticated user.
 *
 * Query params:
 * - period: 'daily' | 'weekly' (default: 'daily')
 *
 * Middleware: Auth + Rate Limit (read:digest)
 */
async function getHandler(
  request: NextRequest,
  context: WithUserValidationContext
): Promise<NextResponse> {
  const { validatedUser } = context;

  try {
    // 1. Parse query parameters
    const { searchParams } = new URL(request.url);
    const queryParams = {
      period: searchParams.get('period') || 'daily',
    };

    const parseResult = DigestQuerySchema.safeParse(queryParams);

    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const { period } = parseResult.data;

    // 2. Get digest via service
    const digest = await digestService.getDigest(validatedUser.id, period);

    return NextResponse.json(digest);
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// =============================================================================
// Export with Middleware
// =============================================================================

// GET: Auth + Rate Limit (no CSRF for read operations)
export const GET = withUserValidation(withRateLimit('read:digest', getHandler));
