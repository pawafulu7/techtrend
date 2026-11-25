/**
 * GET /api/admin/gate-requests - 入口で未登録と拒否された人からの、利用の申請の一覧（対応待ち）
 *
 * 申請は拒否のページのフォームから届く（app/api/gate/request/route.ts）。管理画面の
 * 「サイトに入れるアカウント」と、メニューの件数が読む。
 */
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';
import { GATE_ACCESS_REQUEST_SELECT } from '@/lib/auth/site-gate/access-request-store';
import { GATE_REQUEST_LIST_LIMIT } from '@/lib/auth/site-gate/constants';
import type { GateAccessRequestsResponse } from '@/lib/auth/site-gate/admin-types';
import { summarizeError } from '@/lib/utils/sanitize-error';
import { jsonNoStore } from '../gate-allowlist/_shared';

export const dynamic = 'force-dynamic';

async function getHandler() {
  try {
    const rows = await prisma.gateAccessRequest.findMany({
      select: GATE_ACCESS_REQUEST_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: GATE_REQUEST_LIST_LIMIT,
    });
    const body: GateAccessRequestsResponse = {
      requests: rows.map((row) => ({
        id: row.id,
        email: row.email,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
      })),
    };
    return jsonNoStore(body);
  } catch (error) {
    logger.error(
      { errorSummary: summarizeError(error) },
      '[GateRequestsAPI] 申請の一覧を読めませんでした'
    );
    return jsonNoStore(
      { success: false, error: 'Failed to load the access requests' },
      500
    );
  }
}

export const GET = withAdminAuth(withRateLimit('admin:read', getHandler));
