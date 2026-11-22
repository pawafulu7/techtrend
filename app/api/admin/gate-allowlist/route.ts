/**
 * 管理画面の「サイトに入れるアカウント」の API
 *
 * GET  /api/admin/gate-allowlist - 固定のアドレスと許可リストの一覧
 * POST /api/admin/gate-allowlist - { email } を許可リストに足す
 *
 * 足したアドレスはすぐ入れる（入口の照合は許可の結果だけをキャッシュし、無ければ DB を引く。
 * lib/auth/site-gate/allowlist.ts）。
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
import {
  GATE_ALLOWLIST_ENTRY_SELECT,
  addGateAllowedEmail,
} from '@/lib/auth/site-gate/allowlist-store';
import logger from '@/lib/logger';
import { getSiteGateConfig } from '@/lib/auth/site-gate/server-config';
import { getCurrentGateEmail } from '@/lib/auth/site-gate/current-account';
import {
  GATE_EMAIL_MAX_LENGTH,
  maskGateEmail,
  normalizeGateEmail,
} from '@/lib/auth/site-gate/email';
import {
  GATE_ALLOWLIST_LIST_LIMIT,
  GATE_ALLOWLIST_MAX_ENTRIES,
} from '@/lib/auth/site-gate/constants';
import type {
  GateAllowlistAddResponse,
  GateAllowlistEntry,
  GateAllowlistResponse,
} from '@/lib/auth/site-gate/admin-types';
import { GATE_ALLOWLIST_ERROR_CODES } from '@/lib/constants/gate-allowlist-error-codes';
import { isUniqueConstraintViolationOn } from '@/lib/utils/prisma-constraint';
import { summarizeError } from '@/lib/utils/sanitize-error';
import { gateAllowlistError, jsonNoStore } from './_shared';

export const dynamic = 'force-dynamic';

async function currentGateEmailOrNull(
  request: NextRequest,
  config: ReturnType<typeof getSiteGateConfig>
): Promise<string | null> {
  try {
    return await getCurrentGateEmail(config, request.headers);
  } catch (error) {
    // 一覧の目印が付かないだけなので、一覧は返す（削除の API は断る側に倒す）
    logger.warn(
      { errorSummary: summarizeError(error) },
      '[GateAllowlistAPI] 入口のログイン状態を確かめられませんでした'
    );
    return null;
  }
}

async function getHandler(request: NextRequest) {
  const config = getSiteGateConfig();
  const fixedEmails =
    config.kind === 'enabled' ? config.settings.fixedEmails : [];

  try {
    const [rows, currentEmail] = await Promise.all([
      prisma.gateAllowedEmail.findMany({
        select: GATE_ALLOWLIST_ENTRY_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: GATE_ALLOWLIST_LIST_LIMIT,
      }),
      currentGateEmailOrNull(request, config),
    ]);

    const rowByEmail = new Map(rows.map((row) => [row.email, row]));
    const toEntry = (
      email: string,
      row: (typeof rows)[number] | undefined,
      isFixed: boolean
    ): GateAllowlistEntry => ({
      id: row?.id ?? null,
      email,
      createdAt: row?.createdAt.toISOString() ?? null,
      isFixed,
      isCurrentGateAccount: currentEmail !== null && currentEmail === email,
    });

    const entries: GateAllowlistEntry[] = [
      // 環境変数を変えて DB の行と固定のアドレスが重なったときは 1 行にまとめ、固定の扱いにする
      ...fixedEmails.map((email) =>
        toEntry(email, rowByEmail.get(email), true)
      ),
      ...rows
        .filter((row) => !fixedEmails.includes(row.email))
        .map((row) => toEntry(row.email, row, false)),
    ];

    const body: GateAllowlistResponse = {
      gateEnabled: config.kind === 'enabled',
      maxEntries: GATE_ALLOWLIST_MAX_ENTRIES,
      entries,
    };
    return jsonNoStore(body);
  } catch (error) {
    logger.error(
      { errorSummary: summarizeError(error) },
      '[GateAllowlistAPI] 一覧を読めませんでした'
    );
    return jsonNoStore(
      { success: false, error: 'Failed to load the allowlist' },
      500
    );
  }
}

const addSchema = z
  .object({ email: z.string().max(GATE_EMAIL_MAX_LENGTH) })
  .strict();

async function postHandler(
  request: NextRequest,
  context: WithAdminAuthContext
) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonNoStore({ success: false, error: 'Invalid request body' }, 400);
  }
  const parsed = addSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonNoStore({ success: false, error: 'Invalid request body' }, 400);
  }

  const email = normalizeGateEmail(parsed.data.email);
  if (email === null) {
    return gateAllowlistError(
      400,
      GATE_ALLOWLIST_ERROR_CODES.NOT_GMAIL,
      'Only Gmail addresses can be added'
    );
  }

  const config = getSiteGateConfig();
  if (
    config.kind === 'enabled' &&
    config.settings.fixedEmails.includes(email)
  ) {
    return gateAllowlistError(
      409,
      GATE_ALLOWLIST_ERROR_CODES.ALREADY_FIXED,
      'The address is fixed by the environment'
    );
  }

  try {
    const created = await addGateAllowedEmail(prisma, {
      email,
      createdById: context.session.user.id,
      fixedEmails: config.kind === 'enabled' ? config.settings.fixedEmails : [],
    });
    if (created === null) {
      return gateAllowlistError(
        400,
        GATE_ALLOWLIST_ERROR_CODES.LIST_FULL,
        'The allowlist is full'
      );
    }

    logger.info(
      {
        adminId: context.session.user.id,
        entryId: created.id,
        email: maskGateEmail(created.email),
      },
      '[GateAllowlistAPI] サイトに入れるアカウントを追加しました'
    );

    const body: GateAllowlistAddResponse = {
      entry: {
        id: created.id,
        email: created.email,
        createdAt: created.createdAt.toISOString(),
        isFixed: false,
        isCurrentGateAccount: false,
      },
    };
    return jsonNoStore(body, 201);
  } catch (error) {
    if (isUniqueConstraintViolationOn(error, 'GateAllowedEmail', 'email')) {
      return gateAllowlistError(
        409,
        GATE_ALLOWLIST_ERROR_CODES.ALREADY_LISTED,
        'The address is already listed'
      );
    }
    logger.error(
      { errorSummary: summarizeError(error) },
      '[GateAllowlistAPI] アドレスを追加できませんでした'
    );
    return jsonNoStore(
      { success: false, error: 'Failed to add the address' },
      500
    );
  }
}

export const GET = withAdminAuth(withRateLimit('admin:read', getHandler));
export const POST = withCSRFProtection(
  withRateLimit('admin:write', withAdminAuth(postHandler))
);
