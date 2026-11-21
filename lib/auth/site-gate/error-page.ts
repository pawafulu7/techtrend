/**
 * 入口のログインで拒否・失敗したときのページ（/api/gate/error）
 *
 * Better Auth の組み込みのページは英語で、ライブラリの説明サイトへのリンクと「Ask AI」のボタンを
 * 外せない（customizeDefaultErrorPage で変えられるのは色と飾りだけ）ので、自前の日本語のページを返す
 * （2026-11-21 のユーザーの決定）。
 *
 * 入口を通っていない人に見せるので、Next.js のページにはせず（サイトの共通の外枠とそこで読むデータを
 * 出さないため）、単独の HTML を Route Handler から返す。JS・Web フォント・外部の読み込みは使わない
 * （CSP は style-src 'unsafe-inline' を許している: lib/config/security-headers.ts）。
 */
import { GATE_START_PATH } from './constants';
import { toDisplayedGateErrorCode } from './error-codes';
import { WORDMARK_EM_HEIGHT, WORDMARK_PATH, WORDMARK_VIEWBOX } from './wordmark';

interface GateErrorContent {
  status: 400 | 403 | 503;
  /** 12 文字前後（幅 390px の画面でも 1 行に収める） */
  title: string;
  /**
   * 1 文ずつ段落にし、1 文は 16〜18 文字までにする。面の中の文字の幅（約 23 文字）を少し超える文は
   * 「長い行 + 短い行」に割れ、それが続くと端がジグザグに見えるため。どうすればよいかはボタンに持たせる
   */
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

const CONTENTS: Record<string, GateErrorContent> = {
  not_allowed: {
    status: 403,
    title: 'ログインできません',
    lines: ['このサイトに未登録のアカウントです。', '追加は、管理者に頼んでください。'],
    action: '登録済みのアカウントで入る',
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// サイトのログイン画面（app/auth/login/_components/login-content.tsx）と同じ並べ方にする。
// 上部の帯にロゴの印とサイト名（ヘッダーと同じ字形）、その下に幅 32rem の面、中央寄せの見出しと説明、
// 幅いっぱいのボタン。色・角丸・見出しの大きさ・書体の順はサイトのトークン（app/generated-tokens.css）に合わせる
const STYLE = `
:root{color-scheme:light dark;--background:#FFFFFF;--canvas:#F0F2F8;--surface:#FFFFFF;--text:#111633;--muted:#525B78;--border:#D6DBE8;--primary:#3A3FC0;--on-primary:#FFFFFF;--heat:#B83A0B}
@media (prefers-color-scheme:dark){:root{--background:#090E22;--canvas:#090E22;--surface:#10172F;--text:#E3E7F5;--muted:#98A1C2;--border:#222C4E;--primary:#A3ADFF;--on-primary:#090E22;--heat:#FFA25C}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:var(--canvas);color:var(--text);font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic UI",Meiryo,"Noto Sans JP","Noto Sans CJK JP",system-ui,sans-serif;font-size:15px;line-height:1.7}
.bar{display:flex;align-items:center;height:48px;padding:0 16px;background:var(--background);border-bottom:1px solid var(--border)}
.brand{display:inline-flex;align-items:center;gap:8px;color:var(--text)}
.mark{width:22px;height:22px;flex:none}
.wordmark{height:${(18 * WORDMARK_EM_HEIGHT).toFixed(2)}px;width:auto;fill:currentColor}
main{max-width:32rem;margin:40px auto;padding:0 16px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:32px 24px 24px;text-align:center}
h1{margin:0 0 8px;font-size:clamp(1.5rem,1rem + 2vw,1.75rem);line-height:1.35;font-weight:700}
p{margin:0}
.lines{color:var(--muted)}
.lines p+p{margin-top:2px}
.action{display:flex;align-items:center;justify-content:center;height:40px;margin-top:24px;padding:0 16px;border-radius:6px;background:var(--primary);color:var(--on-primary);font-size:14px;font-weight:600;text-decoration:none}
.action:hover{opacity:.9}
.action:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
.code{margin-top:16px;font-size:13px;line-height:1.5;color:var(--muted);overflow-wrap:anywhere}
@media (min-width:1024px){.bar{padding:0 24px}}
`.trim();

// ロゴの印（components/icons/observatory-mark.tsx と同じ）
const MARK_SVG =
  '<svg class="mark" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="10" stroke="var(--primary)" stroke-width="1.6" opacity="0.35"/>' +
  '<circle cx="12" cy="12" r="6" stroke="var(--primary)" stroke-width="1.6" opacity="0.65"/>' +
  '<circle cx="12" cy="12" r="2.2" fill="var(--heat)"/></svg>';

const WORDMARK_SVG = `<svg class="wordmark" viewBox="${WORDMARK_VIEWBOX}" aria-hidden="true"><path d="${WORDMARK_PATH}"/></svg>`;

/** 拒否・失敗のページの HTML と HTTP ステータス。コードは知っているものだけを出す */
export function renderGateErrorPage(rawCode: string | null): {
  status: number;
  html: string;
} {
  const code = toDisplayedGateErrorCode(rawCode ?? '');
  const content = CONTENTS[code] ?? FALLBACK;
  // 開始は Google のアカウントの選択を毎回出す（prompt=select_account）ので、別のアカウントで入り直せる
  const retryHref = `${GATE_START_PATH}?callbackURL=${encodeURIComponent('/')}`;

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(content.title)} | TechTrend</title>
<style>${STYLE}</style>
</head>
<body>
<header class="bar"><span class="brand" role="img" aria-label="TechTrend">${MARK_SVG}${WORDMARK_SVG}</span></header>
<main>
<section class="card">
<h1>${escapeHtml(content.title)}</h1>
<div class="lines">${content.lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}</div>
<a class="action" href="${escapeHtml(retryHref)}">${escapeHtml(content.action)}</a>
<p class="code">エラーのコード: ${escapeHtml(code)}</p>
</section>
</main>
</body>
</html>
`;
  return { status: content.status, html };
}
