/**
 * POST /api/gate/request - 入口で未登録と拒否された人からの、利用の申請
 *
 * 拒否のページ（/api/gate/error。JS なしの単独の HTML）のフォームから、普通の送信で届く。入口の外から届くので
 * proxy は入口を通さずに渡す（lib/auth/site-gate/evaluate.ts）。応答も HTML のページで返す。
 *
 * - 送れるのは、Google のログインを通って「未登録」と拒否された人だけ。拒否した応答に付けた署名付きの
 *   Cookie（lib/auth/site-gate/request-account-cookie.ts）が無ければ受け付けない
 * - 申請するアドレスはフォームの値。拒否されたアカウントを入れてあり、別の Gmail アドレスに書き換えられる
 *   （2026-11-25 のユーザーの決定）。書き換えたアドレスは Google の確認を経ていないが、許可しても
 *   入れるのはそのアドレスの持ち主だけ。1 つのアドレスにつき申請は 1 件（本人が送り直すと備考を書き換える。
 *   書き換えたアドレスでは、先に届いている申請を変えず、そのアドレスが許可済みか・申請済みかで応答を
 *   変えない。書き換えた申請は、Google で選んだアカウントごとに 1 日 3 件まで）
 * - 申請は自動では許可しない。管理者が管理画面で許可・却下する（app/api/admin/gate-requests/）
 * - アドレスと備考はログに出さない（アドレスはローカル部を伏せる）
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withCSRFProtection } from '@/lib/middleware/csrf-protection';
import { createHash } from 'node:crypto';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import {
  checkRateLimit,
  createRateLimiterFromConfig,
  RateLimitError,
} from '@/lib/middleware/rate-limiter';
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';
import { readRequestTextWithLimit } from '@/lib/utils/http/read-json-with-limit';
import { summarizeError } from '@/lib/utils/sanitize-error';
import { saveGateAccessRequest } from '@/lib/auth/site-gate/access-request-store';
import { GATE_REQUEST_NOTE_MAX_LENGTH } from '@/lib/auth/site-gate/constants';
import { maskGateEmail, normalizeGateEmail } from '@/lib/auth/site-gate/email';
import { renderGateRequestFormPage } from '@/lib/auth/site-gate/error-page';
import {
  GATE_REQUEST_ACCOUNT_COOKIE,
  readGateRequestAccount,
} from '@/lib/auth/site-gate/request-account-cookie';
import {
  renderGateRequestResultPage,
  type GateRequestResult,
} from '@/lib/auth/site-gate/request-page';
import { getSiteGateConfig } from '@/lib/auth/site-gate/server-config';

export const dynamic = 'force-dynamic';

/**
 * 本文の上限。備考は 500 文字までで、フォームの送信（application/x-www-form-urlencoded）は
 * 日本語の 1 文字を 9 バイト（絵文字は 12 バイト）で送る。改行（%0D%0A）も含めて余裕を持たせる
 */
const REQUEST_MAX_BYTES = 16 * 1024;

const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded';

/** 出し直すフォームに戻すアドレスの長さの上限（誤った入力をそのまま返すので、長さだけ絞る） */
const ACCOUNT_ECHO_MAX_LENGTH = 320;

const requestSchema = z.object({
  // 申請するアドレス。許可リストと同じ正規化した Gmail の形にする（Gmail でなければ誤り）
  account: z.string().transform((value, context) => {
    const email = normalizeGateEmail(value);
    if (email === null) {
      context.addIssue({ code: 'custom', message: 'not a Gmail address' });
      return z.NEVER;
    }
    return email;
  }),
  // 備考。改行をそろえ、制御文字（改行とタブのほか）を除き、前後の空白を除いてから長さを見る
  // （textarea の maxlength は改行を 1 文字と数える）。本文の %00 は NUL に戻り、PostgreSQL は NUL を
  // 保存できない（22021）ので、入力の誤りが保存の失敗（503）にならないよう、ここで落とす。
  // 文字の向きを変える文字・幅の無い文字も除き（管理画面での備考の見え方を偽らせない）、
  // 続く空行は 1 行にまとめる（改行だけで一覧を縦に伸ばさせない）
  note: z
    .string()
    .transform((value) =>
      value
        .replace(/\r\n?|[\u2028\u2029]/g, '\n')
        .replace(
          /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g,
          ''
        )
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    )
    .pipe(z.string().max(GATE_REQUEST_NOTE_MAX_LENGTH)),
});

/** 書き換えた申請の回数を数える鍵。Redis の鍵にアドレスをそのまま置かない */
function editedRequestLimitKey(signedInAccount: string): string {
  const normalized = normalizeGateEmail(signedInAccount) ?? signedInAccount;
  return `gate-request-edited:${createHash('sha256').update(normalized).digest('hex')}`;
}

function htmlResponse(page: { status: number; html: string }): Response {
  return new Response(page.html, {
    status: page.status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function resultPage(result: GateRequestResult, account?: string): Response {
  return htmlResponse(renderGateRequestResultPage(result, account));
}

async function postHandler(request: NextRequest): Promise<Response> {
  const config = getSiteGateConfig();
  if (config.kind !== 'enabled') {
    return new NextResponse('Not Found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }
  const { settings } = config;

  // 申請を送れるのは、Google のログインを通って「未登録」と拒否された人だけ（署名付きの Cookie）。
  // 署名が合わない・期限が切れた・Cookie が無いときは受け付けない
  const signedInAccount = readGateRequestAccount(
    request.cookies.get(GATE_REQUEST_ACCOUNT_COOKIE)?.value,
    settings.secret
  );
  if (signedInAccount === null) return resultPage('expired');

  const contentType = (request.headers.get('content-type') ?? '').toLowerCase();
  if (!contentType.startsWith(FORM_CONTENT_TYPE)) return resultPage('unreadable');
  const body = await readRequestTextWithLimit(request, REQUEST_MAX_BYTES);
  if (!body.ok) return resultPage('unreadable');

  // 申請するアドレスはフォームの値（拒否されたアカウントを入れてあり、別の Gmail アドレスに書き換えられる）。
  // 書き換えたアドレスは Google の確認を経ていない。許可しても入れるのはそのアドレスの持ち主だけ
  const form = new URLSearchParams(body.value);
  const rawAccount = (form.get('account') ?? '').slice(0, ACCOUNT_ECHO_MAX_LENGTH);
  const rawNote = form.get('note') ?? '';
  const parsed = requestSchema.safeParse({ account: rawAccount, note: rawNote });
  if (!parsed.success) {
    // 書いた内容を残して出し直す（備考は、画面の入力欄の maxlength で止まるので通常は起きない）
    const invalid = new Set(parsed.error.issues.map((issue) => issue.path[0]));
    return htmlResponse(
      renderGateRequestFormPage(
        {
          kind: 'form',
          account: rawAccount,
          note: rawNote,
          accountError: invalid.has('account')
            ? '@gmail.com のアドレスを入力してください。'
            : undefined,
          noteError: invalid.has('note')
            ? `備考は ${GATE_REQUEST_NOTE_MAX_LENGTH} 文字までにしてください。`
            : undefined,
        },
        400
      )
    );
  }
  const { account: email } = parsed.data;
  const note = parsed.data.note === '' ? null : parsed.data.note;
  // 画面に出すアドレス（入力された形。ドットを残す）
  const account = rawAccount.trim().toLowerCase();
  // 拒否されたアカウントのまま（Google にログインした本人のアドレス）か、別のアドレスに書き換えたか
  const ownAccount = email === normalizeGateEmail(signedInAccount);

  if (!ownAccount) {
    // 書き換えたアドレスの申請は、Google で選んだアカウントごとに 1 日 3 件まで（IP を替えても、1 人が
    // 別々のアドレスの申請を置き続けて対応待ちの枠を埋められないように）。制限を確かめられないとき
    // （Redis の障害）は例外のまま外へ出し、受け付けない
    try {
      await checkRateLimit(
        editedRequestLimitKey(signedInAccount),
        createRateLimiterFromConfig('write:gate-request-edited')
      );
    } catch (error) {
      if (!(error instanceof RateLimitError)) throw error;
      logger.warn(
        { event: 'gate_request.edited_limit' },
        '[site-gate] アドレスを書き換えた利用の申請が、アカウントごとの上限に達しました'
      );
      return resultPage('rate_limited');
    }
  }

  try {
    const saved = await saveGateAccessRequest(prisma, {
      email,
      note,
      fixedEmails: settings.fixedEmails,
      ownAccount,
    });
    // 本人のアカウントが、拒否されたあとに管理者に追加されていたら、申請は置かずにログインを促す。
    // 書き換えたアドレスでは、許可済みかどうかを確かめない（access-request-store.ts。答えると、
    // Google のログインを通った人なら誰でも、任意のアドレスが許可リストにあるかを調べられる）
    if (saved === 'already_allowed') return resultPage('already_allowed', account);
    if (saved === 'full') {
      logger.warn(
        { event: 'gate_request.full' },
        '[site-gate] 対応待ちの利用の申請が上限に達しています'
      );
      return resultPage('full', account);
    }
  } catch (error) {
    // 例外をそのまま渡さない（Prisma の文言に保存しようとした値が載ることがある）
    logger.error(
      { errorSummary: summarizeError(error) },
      '[site-gate] 利用の申請を保存できませんでした'
    );
    return resultPage('unavailable', account);
  }

  logger.info(
    {
      email: maskGateEmail(email),
      hasNote: note !== null,
      // 拒否されたアカウントとは別のアドレスに書き換えて申請したか
      edited: !ownAccount,
    },
    '[site-gate] 利用の申請を受け付けました'
  );
  return resultPage('received', account);
}

// 型引数を明示する（省くと withRateLimit の context の any から、引数 2 つの形に推論される）
const guarded = withCSRFProtection<Response>(
  withRateLimit('write:gate-request', postHandler, { resolveSession: false })
);

/**
 * 回数の制限・CSRF の拒否・制限の確認の失敗は JSON で返る。フォームの送信の応答なので、ページに直して返す
 */
export async function POST(request: NextRequest): Promise<Response> {
  let response: Response;
  try {
    response = await guarded(request);
  } catch (error) {
    logger.error(
      { errorSummary: summarizeError(error) },
      '[site-gate] 利用の申請の受け付けに失敗しました'
    );
    return resultPage('unavailable');
  }
  // handler が返すのはページ（HTML）と、入口が無効なときの 404。JSON は包んでいる部品の拒否だけ
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) {
    return response;
  }
  if (response.status === 429) {
    const page = resultPage('rate_limited');
    const retryAfter = response.headers.get('Retry-After');
    if (retryAfter) page.headers.set('Retry-After', retryAfter);
    return page;
  }
  return resultPage(response.status === 403 ? 'expired' : 'unavailable');
}
