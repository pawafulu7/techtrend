/**
 * DELETE /api/admin/gate-allowlist/[id] - 許可リストからアドレスを外す
 *
 * 外したアドレスは、入口の照合のキャッシュが切れる 30 秒ほどで入れなくなる（lib/auth/site-gate/allowlist.ts）。
 * 管理者が今サイトに入るのに使っているアカウントは消せない（ユーザーの決定。締め出しを防ぐ）。
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
import { getSiteGateConfig } from '@/lib/auth/site-gate/server-config';
import { getCurrentGateEmail } from '@/lib/auth/site-gate/current-account';
import { maskGateEmail } from '@/lib/auth/site-gate/email';
import { GATE_ALLOWLIST_ERROR_CODES } from '@/lib/constants/gate-allowlist-error-codes';
import { summarizeError } from '@/lib/utils/sanitize-error';
import { isPrismaNotFoundError } from '@/lib/utils/prisma-error-handler';
import { gateAllowlistError, jsonNoStore } from '../_shared';

export const dynamic = 'force-dynamic';

// 画面から足した行の ID は cuid だが、手で流す SQL で入れた行も消せるよう、形は縛らず長さだけ見る
// （findUnique の引数に渡すだけ）
const entryIdSchema = z.string().min(1).max(128);

function entryNotFound() {
  return gateAllowlistError(
    404,
    GATE_ALLOWLIST_ERROR_CODES.ENTRY_NOT_FOUND,
    'The address is not in the allowlist'
  );
}

async function deleteHandler(
  request: NextRequest,
  context: WithAdminAuthContext & { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!entryIdSchema.safeParse(id).success) return entryNotFound();

  try {
    const row = await prisma.gateAllowedEmail.findUnique({
      where: { id },
      select: { id: true, email: true },
    });
    if (!row) return entryNotFound();

    const config = getSiteGateConfig();
    let currentEmail: string | null;
    try {
      currentEmail = await getCurrentGateEmail(config, request.headers);
    } catch (error) {
      // 今使っているアカウントかを確かめられないときは消さない（締め出しを防ぐ側に倒す）
      logger.warn(
        { errorSummary: summarizeError(error) },
        '[GateAllowlistAPI] 入口のログイン状態を確かめられないため、削除を断りました'
      );
      return jsonNoStore({ success: false, error: 'Temporarily unavailable' }, 503);
    }
    if (config.kind === 'enabled' && currentEmail === null) {
      // 入口が有効なのに今使っているアカウントが分からない（proxy を通ったあとに入口のログイン状態が切れたなど）。
      // 自分のアカウントを消してしまわないよう、確かめられないときと同じく断る
      logger.warn(
        { adminId: context.session.user.id, entryId: row.id },
        '[GateAllowlistAPI] 入口のログイン状態が無いため、削除を断りました'
      );
      return jsonNoStore({ success: false, error: 'Temporarily unavailable' }, 503);
    }
    if (currentEmail !== null && currentEmail === row.email) {
      return gateAllowlistError(
        409,
        GATE_ALLOWLIST_ERROR_CODES.CANNOT_REMOVE_CURRENT_ACCOUNT,
        'You cannot remove the account you are using'
      );
    }

    await prisma.gateAllowedEmail.delete({ where: { id } });

    // 行を消すと DB に残らないので、誰が何を外したかをログで辿れるようにする（アドレスは伏せる）
    logger.info(
      {
        adminId: context.session.user.id,
        entryId: row.id,
        email: maskGateEmail(row.email),
      },
      '[GateAllowlistAPI] サイトに入れるアカウントを削除しました'
    );
    return jsonNoStore({ success: true });
  } catch (error) {
    // 読んだあとに別の要求で消えていた
    if (isPrismaNotFoundError(error)) return entryNotFound();
    logger.error(
      { errorSummary: summarizeError(error), entryId: id },
      '[GateAllowlistAPI] アドレスを削除できませんでした'
    );
    return jsonNoStore({ success: false, error: 'Failed to remove the address' }, 500);
  }
}

export const DELETE = withCSRFProtection(
  withRateLimit('admin:write', withAdminAuth(deleteHandler))
);
