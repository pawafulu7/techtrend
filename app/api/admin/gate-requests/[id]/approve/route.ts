/**
 * POST /api/admin/gate-requests/[id]/approve - 利用の申請を許可する
 *
 * 申請のアドレスを許可リストに足し、申請を消す（1 つのトランザクション。lib/auth/site-gate/allowlist-store.ts）。
 * 足したアドレスはすぐ入れる（入口の照合は許可の結果だけをキャッシュし、無ければ DB を引く）。
 * 自動では許可しない（管理者がこの API を呼んだときだけ）。
 *
 * 許可リストに新しく足したときは、申請のアドレスに通知メールを送る（lib/auth/site-gate/approval-email.ts）。
 * 送るのは許可のトランザクションが済んだあとで、送れなくても許可は取り消さない。送れたかどうかは
 * 応答の notification で返し、画面が管理者に出す。同じ申請を 2 回許可しても 2 回目は 404 なので、
 * メールは 1 通だけ出る。
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
import { sendGateApprovalEmail } from '@/lib/auth/site-gate/approval-email';
import { maskGateEmail } from '@/lib/auth/site-gate/email';
import { getSiteGateConfig } from '@/lib/auth/site-gate/server-config';
import type { GateAccessRequestApproveResponse } from '@/lib/auth/site-gate/admin-types';
import { GATE_ALLOWLIST_ERROR_CODES } from '@/lib/constants/gate-allowlist-error-codes';
import { summarizeError } from '@/lib/utils/sanitize-error';
import { gateAllowlistError, jsonNoStore } from '@/app/api/admin/gate-allowlist/_shared';

export const dynamic = 'force-dynamic';
// 通知メールの送信を最大 10 秒待つ（GATE_APPROVAL_EMAIL_TIMEOUT_MS）。関数の実行時間の上限が短い設定でも、
// 許可が済んだのに応答だけ失われることが無いようにする
export const maxDuration = 30;

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
    // すでに許可されていたとき（本人はもう入れる。申請は他人がアドレスを入力して置いたものでありうる）と、
    // 入口が無効のとき（誰でも入れる）は送らない
    const notification =
      result.status === 'approved' && config.kind === 'enabled'
        ? // 許可は済んでいるので、万一ここで例外が出ても許可の応答は失敗にしない
          await sendGateApprovalEmail(result.email, config.settings.baseOrigin).catch(
            () => 'failed' as const
          )
        : 'none';
    const body: GateAccessRequestApproveResponse = {
      status: result.status,
      email: result.email,
      notification,
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
