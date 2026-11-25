/**
 * POST /api/admin/gate-requests/[id]/approve - 利用の申請を許可する
 *
 * 申請のアドレスを許可リストに足し、申請を消す（1 つのトランザクション。lib/auth/site-gate/allowlist-store.ts）。
 * 足したアドレスはすぐ入れる（入口の照合は許可の結果だけをキャッシュし、無ければ DB を引く）。
 * 自動では許可しない（管理者がこの API を呼んだときだけ）。
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
import { approveGateAccessRequest } from '@/lib/auth/site-gate/allowlist-store';
import { maskGateEmail } from '@/lib/auth/site-gate/email';
import { getSiteGateConfig } from '@/lib/auth/site-gate/server-config';
import type { GateAccessRequestApproveResponse } from '@/lib/auth/site-gate/admin-types';
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

async function postHandler(
  _request: NextRequest,
  context: WithAdminAuthContext & { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!requestIdSchema.safeParse(id).success) return requestNotFound();

  const config = getSiteGateConfig();
  try {
    const result = await approveGateAccessRequest(prisma, {
      requestId: id,
      approvedById: context.session.user.id,
      fixedEmails: config.kind === 'enabled' ? config.settings.fixedEmails : [],
    });
    if (result.status === 'not_found') return requestNotFound();
    if (result.status === 'list_full') {
      return gateAllowlistError(
        400,
        GATE_ALLOWLIST_ERROR_CODES.LIST_FULL,
        'The allowlist is full'
      );
    }

    logger.info(
      {
        adminId: context.session.user.id,
        requestId: id,
        email: maskGateEmail(result.email),
        status: result.status,
      },
      '[GateRequestsAPI] 利用の申請を許可しました'
    );
    const body: GateAccessRequestApproveResponse = {
      status: result.status,
      email: result.email,
    };
    return jsonNoStore(body);
  } catch (error) {
    logger.error(
      { errorSummary: summarizeError(error), requestId: id },
      '[GateRequestsAPI] 利用の申請を許可できませんでした'
    );
    return jsonNoStore(
      { success: false, error: 'Failed to approve the access request' },
      500
    );
  }
}

export const POST = withCSRFProtection(
  withRateLimit('admin:write', withAdminAuth(postHandler))
);
