/**
 * Admin Inquiries API - 対応状況の更新
 *
 * PATCH /api/admin/inquiries/[id] - { status } を受け取り、更新後の問い合わせを返す
 */

import { NextRequest, NextResponse } from 'next/server';
import { withCSRFProtection } from '@/lib/middleware/csrf-protection';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import {
  withAdminAuth,
  type WithAdminAuthContext,
} from '@/lib/middleware/with-admin-auth';
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';
import { ValidationError, formatErrorResponse } from '@/lib/errors';
import { handlePrismaError } from '@/lib/utils/prisma-error-handler';
import {
  firstIssue,
  inquiryIdSchema,
  updateInquirySchema,
} from '@/lib/inquiries/schema';
import {
  INQUIRY_LIST_SELECT,
  toInquiryListItem,
} from '@/lib/inquiries/serialize';
import type { AdminInquiryUpdateResponse } from '@/app/admin/inquiries/_types';

export const dynamic = 'force-dynamic';

const NO_STORE = 'private, no-cache, no-store, must-revalidate';

function validationError(message: string, field?: string) {
  return NextResponse.json(
    formatErrorResponse(new ValidationError(message, field)),
    { status: 400 }
  );
}

async function handler(
  request: NextRequest,
  context: WithAdminAuthContext & { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!inquiryIdSchema.safeParse(id).success) {
    return validationError('問い合わせが見つかりません', 'id');
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return validationError('送信内容を読み取れませんでした');
  }

  const parsed = updateInquirySchema.safeParse(rawBody);
  if (!parsed.success) {
    const { field, message } = firstIssue(parsed.error);
    return validationError(message, field);
  }

  try {
    const updated = await prisma.inquiry.update({
      where: { id },
      data: { status: parsed.data.status },
      select: INQUIRY_LIST_SELECT,
    });

    logger.info(
      {
        adminId: context.session.user.id,
        inquiryId: id,
        status: parsed.data.status,
      },
      'Inquiry status updated'
    );

    const response: AdminInquiryUpdateResponse = {
      data: toInquiryListItem(updated),
    };
    return NextResponse.json(response, {
      headers: { 'Cache-Control': NO_STORE },
    });
  } catch (error) {
    // P2025（存在しない id）は 404 にする
    const handled = handlePrismaError(error);
    if (handled) return handled;

    const err = error as { name?: string; code?: string };
    logger.error(
      { errorName: err?.name, errorCode: err?.code, inquiryId: id },
      '[AdminInquiriesAPI] Failed to update inquiry'
    );
    return NextResponse.json(
      { error: 'Failed to update inquiry' },
      { status: 500 }
    );
  }
}

export const PATCH = withCSRFProtection(
  withRateLimit('admin:write', withAdminAuth(handler))
);
