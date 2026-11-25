/**
 * 入口のログインで拒否・失敗したときのページ（/api/gate/error）
 *
 * Better Auth の組み込みのページは英語で、ライブラリの説明サイトへのリンクと「Ask AI」のボタンを
 * 外せない（customizeDefaultErrorPage で変えられるのは色と飾りだけ）ので、自前の日本語のページを返す
 * （2026-11-21 のユーザーの決定）。外枠は page-shell.ts。
 *
 * 未登録のアカウント（not_allowed）で、誰が拒否されたかが分かるとき（request-account-cookie.ts）は、
 * 利用の申請のフォームを出す。申請するアドレスの欄には拒否されたアカウントを入れておき、書き換えられる
 * （2026-11-25 のユーザーの決定）。
 */
import { GATE_REQUEST_NOTE_MAX_LENGTH, GATE_REQUEST_PATH } from './constants';
import { GATE_EMAIL_MAX_LENGTH } from './email';
import { toDisplayedGateErrorCode } from './error-codes';
import {
  escapeHtml,
  gateAccountBox,
  gateStartLink,
  renderGatePage,
} from './page-shell';

interface GateErrorContent {
  status: 400 | 403 | 503;
  title: string;
  lines: readonly string[];
  action: string;
}

const RETRY = 'もう一度ログインする';

const RESTART: GateErrorContent = {
  status: 400,
  title: 'ログインを続けられません',
  lines: ['ログインの手続きが切れました。', 'もう一度ログインしてください。'],
  action: RETRY,
};

const NOT_ALLOWED_CODE = 'not_allowed';
const NOT_ALLOWED_TITLE = 'ログインできません';
const NOT_ALLOWED_ACTION = '登録済みのアカウントで入る';

const CONTENTS: Record<string, GateErrorContent> = {
  [NOT_ALLOWED_CODE]: {
    status: 403,
    title: NOT_ALLOWED_TITLE,
    lines: ['このサイトに未登録のアカウントです。', '追加は、管理者に頼んでください。'],
    action: NOT_ALLOWED_ACTION,
  },
  email_not_verified: {
    status: 403,
    title: 'ログインできません',
    lines: ['メールが未確認のアカウントです。', 'Googleでの確認が必要です。'],
    action: '別のアカウントで入る',
  },
  temporarily_unavailable: {
    status: 503,
    title: 'いまは確かめられません',
    lines: ['登録の確認が一時的にできません。', '少し待ってから入り直してください。'],
    action: RETRY,
  },
  access_denied: {
    status: 400,
    title: 'ログインを取り消しました',
    lines: ['アカウントの選択が取り消されました。', 'もう一度ログインしてください。'],
    action: RETRY,
  },
  state_mismatch: RESTART,
  state_not_found: RESTART,
  state_invalid: RESTART,
  state_security_mismatch: RESTART,
  please_restart_the_process: RESTART,
  invalid_callback_request: RESTART,
  no_code: RESTART,
};

const FALLBACK: GateErrorContent = {
  status: 400,
  title: 'ログインできません',
  lines: ['ログインを完了できませんでした。', 'もう一度ログインしてください。'],
  action: RETRY,
};

function codeLine(code: string): string {
  return `<p class="code">エラーのコード: ${escapeHtml(code)}</p>`;
}

/**
 * 未登録と拒否されたアカウントの、利用の申請の扱い
 * - form: 申請のフォームを出す。account は入力欄に入れておくアドレス（拒否の直後は Google で選んだアカウント。
 *   出し直すときは送られてきた値）。accountError・noteError は、送信の内容に誤りがあって出し直すとき
 * - pending: すでに申請が届いている（フォームは出さない）
 */
export type GateAccessRequestView =
  | {
      kind: 'form';
      account: string;
      note?: string;
      /** アドレスの誤り（入力欄に付ける） */
      accountError?: string;
      /** 備考の誤り（入力欄に付ける） */
      noteError?: string;
    }
  | { kind: 'pending'; account: string };

/** 誤りのある入力欄に付ける属性。出し直すときは、最初の誤りの欄へフォーカスを移す（JS を使わないので autofocus） */
function fieldState(id: string, invalid: boolean, focus: boolean): string {
  return ` aria-describedby="${invalid ? `${id}-error ` : ''}${id}-hint"${invalid ? ' aria-invalid="true"' : ''}${focus ? ' autofocus' : ''}`;
}

function fieldError(id: string, message: string | undefined): string {
  return message === undefined
    ? ''
    : `<p class="invalid" id="${id}-error">${escapeHtml(message)}</p>`;
}

function requestForm(view: Extract<GateAccessRequestView, { kind: 'form' }>): string {
  const accountInvalid = view.accountError !== undefined;
  const noteInvalid = view.noteError !== undefined;
  return [
    `<form class="request" method="post" action="${GATE_REQUEST_PATH}">`,
    // 申請するアドレス。Google で選んだアカウントを入れておき、別の Gmail アドレスに書き換えられる
    // （2026-11-25 のユーザーの決定）。書き換えたアドレスは Google の確認を経ていない
    '<div class="field"><label class="label" for="account">申請するアカウント（Gmail アドレス）</label>',
    `<input id="account" name="account" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" required maxlength="${GATE_EMAIL_MAX_LENGTH}" value="${escapeHtml(view.account)}"`,
    `${fieldState('account', accountInvalid, accountInvalid)}>`,
    fieldError('account', view.accountError),
    '<p class="hint" id="account-hint">Google で選んだアカウントを入れてあります。別の Gmail アドレスで申請するときは、書き換えてください。</p></div>',
    `<div class="field"><label class="label" for="note">備考（任意・${GATE_REQUEST_NOTE_MAX_LENGTH} 文字まで）</label>`,
    `<textarea id="note" name="note" rows="3" maxlength="${GATE_REQUEST_NOTE_MAX_LENGTH}"`,
    `${fieldState('note', noteInvalid, noteInvalid && !accountInvalid)}>`,
    // textarea は先頭の改行を 1 つ読み飛ばすので、値の前に改行を置く（値が改行で始まっても失わない）
    `\n${escapeHtml(view.note ?? '')}</textarea>`,
    fieldError('note', view.noteError),
    '<p class="hint" id="note-hint">お名前など、誰からの申請か分かることを書いてください。</p></div>',
    '<button class="action" type="submit">利用を申請する</button>',
    '</form>',
  ].join('');
}

/**
 * 利用の申請のフォームを出したページ。GET（拒否の直後。403）と、送信の内容に誤りがあったときの
 * 出し直し（app/api/gate/request/route.ts。400）の両方が使う
 */
export function renderGateRequestFormPage(
  view: Extract<GateAccessRequestView, { kind: 'form' }>,
  status: 400 | 403
): { status: number; html: string } {
  return renderGatePage({
    status,
    title: NOT_ALLOWED_TITLE,
    lines: ['このサイトに未登録のアカウントです。', '利用の申請を管理者に送れます。'],
    bodyHtml: [
      requestForm(view),
      gateStartLink(NOT_ALLOWED_ACTION, true),
      codeLine(NOT_ALLOWED_CODE),
    ].join('\n'),
  });
}

/**
 * 拒否・失敗のページの HTML と HTTP ステータス。コードは知っているものだけを出す。
 * request は、未登録（not_allowed）で拒否されたアカウントが分かるときだけ渡す（ほかのコードでは使わない）
 */
export function renderGateErrorPage(
  rawCode: string | null,
  request?: GateAccessRequestView
): {
  status: number;
  html: string;
} {
  const code = toDisplayedGateErrorCode(rawCode ?? '');
  if (code === NOT_ALLOWED_CODE && request?.kind === 'form') {
    return renderGateRequestFormPage(request, 403);
  }
  if (code === NOT_ALLOWED_CODE && request?.kind === 'pending') {
    return renderGatePage({
      status: 403,
      title: 'まだログインできません',
      lines: ['このアカウントは申請済みです。', '管理者の確認をお待ちください。'],
      bodyHtml: [
        gateAccountBox(request.account),
        gateStartLink('別のアカウントで入る'),
        codeLine(code),
      ].join('\n'),
    });
  }

  const content = CONTENTS[code] ?? FALLBACK;
  return renderGatePage({
    status: content.status,
    title: content.title,
    lines: content.lines,
    bodyHtml: [gateStartLink(content.action), codeLine(code)].join('\n'),
  });
}

/**
 * 回数の制限（withRateLimit）が返す JSON の 429 を、ページに直す。
 *
 * 入口のログインの開始・Google からの戻り・拒否のページは、どれも画面の遷移で開く。JSON のままだと、
 * 利用者は JSON の文字列を見ることになる。429 のほかはそのまま返す。Retry-After などの見出しは残す
 */
export function toGateRateLimitedPage(response: Response): Response {
  if (response.status !== 429) return response;
  const { status, html } = renderGatePage({
    status: 429,
    title: 'しばらくお待ちください',
    lines: ['アクセスの回数が多すぎます。', '時間をおいて入り直してください。'],
    bodyHtml: gateStartLink(RETRY),
  });
  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  for (const name of [
    'Retry-After',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
  ]) {
    const value = response.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  return new Response(html, { status, headers });
}
