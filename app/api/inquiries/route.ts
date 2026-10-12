/**
 * Inquiries API Route
 *
 * POST /api/inquiries - 問い合わせ・機能要望を受け付ける（未ログインでも送れる）
 *
 * ログイン中はアカウントに紐付け、送信時のアカウントのメールを返信先として残す。
 * 本文・返信先・IP はログに出さない。
 */

import { NextRequest, NextResponse } from 'next/server';
import { withCSRFProtection } from '@/lib/middleware/csrf-protection';
import {
  withRateLimit,
  createRateLimitedResponse,
} from '@/lib/middleware/with-rate-limit';
import type { SessionContext } from '@/lib/middleware/session-context';
import {
  checkRateLimit,
  createRateLimiterFromConfig,
  RateLimitError,
} from '@/lib/rate-limiter';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@/lib/prisma-exports';
import logger from '@/lib/logger';
import { ValidationError, AppError, formatErrorResponse } from '@/lib/errors';
import { readJsonWithLimit } from '@/lib/utils/http/read-json-with-limit';
import {
  INQUIRY_EMAIL_MAX_LENGTH,
  INQUIRY_REQUEST_MAX_BYTES,
} from '@/lib/inquiries/constants';
import { createInquirySchema, firstIssue } from '@/lib/inquiries/schema';

// 保存件数の全体上限は、送信者を問わず1つのキーで数える
const GLOBAL_LIMIT_KEY = 'inquiry:global';

class PayloadTooLargeError extends AppError {
  constructor() {
    super(
      '内容が長すぎます。短くしてから送ってください',
      'PAYLOAD_TOO_LARGE',
      413
    );
  }
}

/**
 * 受け付けたときの応答。id・本文・返信先は返さない。
 * linkedToAccount はアカウントに紐付いたか、hasReplyChannel は返信先を残したか（完了表示の文言に使う）
 */
function received(
  linkedToAccount: boolean,
  hasReplyChannel: boolean
): NextResponse {
  return NextResponse.json(
    { data: { received: true, linkedToAccount, hasReplyChannel } },
    { status: 201 }
  );
}

function errorResponse(error: AppError): NextResponse {
  return NextResponse.json(formatErrorResponse(error), {
    status: error.statusCode,
  });
}

/** ログイン中で退会していないユーザーだけを返す（それ以外は未ログイン扱い） */
function activeUser(
  session: SessionContext['session']
): { id: string; email: string } | null {
  const user = session?.user;
  if (!user?.id || user.deletedAt) return null;
  return { id: user.id, email: user.email };
}

async function postHandler(
  request: NextRequest,
  context?: SessionContext
): Promise<NextResponse> {
  const body = await readJsonWithLimit(request, INQUIRY_REQUEST_MAX_BYTES);
  if (!body.ok) {
    return errorResponse(
      body.reason === 'too_large'
        ? new PayloadTooLargeError()
        : new ValidationError('送信内容を読み取れませんでした')
    );
  }

  const parsed = createInquirySchema.safeParse(body.value);
  if (!parsed.success) {
    const { field, message } = firstIssue(parsed.error);
    return errorResponse(new ValidationError(message, field));
  }

  const user = activeUser(context?.session);

  // ログイン中は送信時のアカウントのメールを返信先にする（後でメールが変わっても残る）。
  // 列の上限（254 文字）を超えるアドレスは返信先にせず、紐付け（userId）だけ残す
  const { website, category, message, contactEmail } = parsed.data;
  const replyEmail = user
    ? user.email.length <= INQUIRY_EMAIL_MAX_LENGTH
      ? user.email
      : null
    : (contactEmail ?? null);
  const data = {
    category,
    message,
    contactEmail: replyEmail,
    userId: user?.id ?? null,
  };

  // bot 避けの隠し項目に値があれば保存しない。応答は通常と同じにして見分けさせない
  if (website !== undefined && website !== null && website !== '') {
    logger.info({ event: 'inquiry.honeypot' }, 'Inquiry honeypot triggered');
    return received(data.userId !== null, replyEmail !== null);
  }

  const globalLimiter = createRateLimiterFromConfig('write:inquiry-global');
  try {
    await checkRateLimit(GLOBAL_LIMIT_KEY, globalLimiter);
  } catch (error) {
    if (error instanceof RateLimitError) {
      logger.warn(
        { event: 'inquiry.global_limit' },
        'Inquiry global limit reached'
      );
      return createRateLimitedResponse(error);
    }
    throw error;
  }

  try {
    try {
      await prisma.inquiry.create({ data, select: { id: true } });
    } catch (error) {
      // セッションを確かめた後、保存までの間に User 行が消えた（管理者の物理削除）。
      // Inquiry の FK は userId だけなので、紐付けを外して1回だけ保存し直す
      if (
        data.userId !== null &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        await prisma.inquiry.create({
          data: { ...data, userId: null },
          select: { id: true },
        });
        return received(false, replyEmail !== null);
      }
      throw error;
    }
  } catch (error) {
    // 保存できなかった分は全体の枠を返す（DB の障害中の送信で、復旧後の受付を止めない）
    await globalLimiter.reward(GLOBAL_LIMIT_KEY, 1).catch(() => undefined);

    // err を丸ごと渡さない（Prisma の message に保存しようとした値が載ることがある）
    const err = error as { name?: string; code?: string };
    logger.error(
      { errorName: err?.name, errorCode: err?.code },
      'Failed to save inquiry'
    );
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      },
      { status: 500 }
    );
  }

  return received(data.userId !== null, replyEmail !== null);
}

// POST: CSRF + Rate Limit（IP 単位）。ログイン任意のため withUserValidation は使わない
export const POST = withCSRFProtection(
  withRateLimit('write:inquiry', postHandler)
);
