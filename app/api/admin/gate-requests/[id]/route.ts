/**
 * DELETE /api/admin/gate-requests/[id] - 利用の申請を却下する（申請の行を消す。許可リストは変えない）
 *
 * 却下した記録は残さない。同じアカウントは、もう一度ログインを試みれば申請し直せる。
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withCSRFProtection } from '@/lib/middleware/csrf-protection';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import {
  withAdminAuth,
  type WithAdminAuthContext,
} from '@/lib/middleware/with-admin-auth';
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';
import { rejectGateAccessRequest } from '@/lib/auth/site-gate/allowlist-store';
import { maskGateEmail } from '@/lib/auth/site-gate/email';
import { GATE_ALLOWLIST_ERROR_CODES } from '@/lib/constants/gate-allowlist-error-codes';
import { summarizeError } from '@/lib/utils/sanitize-error';
import { gateAllowlistError, jsonNoStore } from '@/app/api/admin/gate-allowlist/_shared';

export const dynamic = 'force-dynamic';

const requestIdSchema = z.string().min(1).max(128);

function requestNotFound() {
  return gateAllowlistError(
    404,
    GATE_ALLOWLIST_ERROR_CODES.REQUEST_NOT_FOUND,
    'The access request does not exist'
  );
}

async function deleteHandler(
  _request: NextRequest,
  context: WithAdminAuthContext & { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!requestIdSchema.safeParse(id).success) return requestNotFound();

  try {
    // 許可と同じロックで直列にする（lib/auth/site-gate/allowlist-store.ts）。別の管理者が先に許可・却下していたら 404
    const email = await rejectGateAccessRequest(prisma, id);
    if (email === null) return requestNotFound();

    // 行を消すと DB に残らないので、誰が何を却下したかをログで辿れるようにする（アドレスは伏せる）
    logger.info(
      {
        adminId: context.session.user.id,
        requestId: id,
        email: maskGateEmail(email),
      },
      '[GateRequestsAPI] 利用の申請を却下しました'
    );
    return jsonNoStore({ success: true });
  } catch (error) {
    logger.error(
      { errorSummary: summarizeError(error), requestId: id },
      '[GateRequestsAPI] 利用の申請を却下できませんでした'
    );
    return jsonNoStore(
      { success: false, error: 'Failed to reject the access request' },
      500
    );
  }
}

export const DELETE = withCSRFProtection(
  withRateLimit('admin:write', withAdminAuth(deleteHandler))
);
