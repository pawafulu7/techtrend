/**
 * 入口の外で出す単独の HTML ページの外枠（拒否・失敗のページ error-page.ts と、利用の申請の結果 request-page.ts）
 *
 * 入口を通っていない人に見せるので、Next.js のページにはせず（サイトの共通の外枠とそこで読むデータを
 * 出さないため）、単独の HTML を Route Handler から返す。JS・Web フォント・外部の読み込みは使わない
 * （CSP は style-src 'unsafe-inline' と form-action 'self' を許している: lib/config/security-headers.ts）。
 */
import { GATE_START_PATH } from './constants';
import { WORDMARK_EM_HEIGHT, WORDMARK_PATH, WORDMARK_VIEWBOX } from './wordmark';

export interface GatePageContent {
  status: number;
  /** 12 文字前後（幅 390px の画面でも 1 行に収める） */
  title: string;
  /**
   * 1 文ずつ段落にし、1 文は 16〜18 文字までにする。面の中の文字の幅（約 23 文字）を少し超える文は
   * 「長い行 + 短い行」に割れ、それが続くと端がジグザグに見えるため。どうすればよいかはボタンに持たせる
   */
  lines: readonly string[];
  /** 説明の下に置く HTML。値は呼び出し側が escapeHtml を通す */
  bodyHtml: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// サイトのログイン画面（app/auth/login/_components/login-content.tsx）と同じ並べ方にする。
// 上部の帯にロゴの印とサイト名（ヘッダーと同じ字形）、その下に幅 32rem の面、中央寄せの見出しと説明、
// 幅いっぱいのボタン。色・角丸・見出しの大きさ・書体の順はサイトのトークン（app/generated-tokens.css）に合わせる。
// 利用の申請のフォームは、面の中を罫線で区切って左寄せにする（入力欄は左から読むため）
const STYLE = `
:root{color-scheme:light dark;--background:#FFFFFF;--canvas:#F0F2F8;--surface:#FFFFFF;--text:#111633;--muted:#525B78;--border:#D6DBE8;--primary:#3A3FC0;--on-primary:#FFFFFF;--heat:#B83A0B;--negative:#B91C1C}
@media (prefers-color-scheme:dark){:root{--background:#090E22;--canvas:#090E22;--surface:#10172F;--text:#E3E7F5;--muted:#98A1C2;--border:#222C4E;--primary:#A3ADFF;--on-primary:#090E22;--heat:#FFA25C;--negative:#F87171}}
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
.action{display:flex;align-items:center;justify-content:center;width:100%;height:40px;margin-top:24px;padding:0 16px;border:1px solid transparent;border-radius:6px;background:var(--primary);color:var(--on-primary);font-family:inherit;font-size:14px;font-weight:600;text-decoration:none;cursor:pointer}
.action:hover{opacity:.9}
.action:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
.action.secondary{margin-top:12px;border-color:var(--border);background:transparent;color:var(--text)}
.account{margin-top:20px;padding:10px 12px;border-radius:6px;background:var(--canvas);font-size:14px;line-height:1.5;overflow-wrap:anywhere}
.request{margin-top:24px;padding-top:20px;border-top:1px solid var(--border);text-align:left}
.field+.field{margin-top:16px}
.label{display:block;font-size:13px;font-weight:600}
.request input,.request textarea{display:block;width:100%;margin-top:6px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:var(--background);color:var(--text);font:inherit;line-height:1.6}
.request input{height:40px}
.request textarea{min-height:88px;resize:vertical}
.request input:focus-visible,.request textarea:focus-visible{outline:2px solid var(--primary);outline-offset:1px}
.request [aria-invalid="true"]{border-color:var(--negative)}
.hint,.invalid{margin-top:6px;font-size:13px;line-height:1.5;color:var(--muted)}
.invalid{color:var(--negative)}
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

/**
 * 入口のログインの開始へのリンク。
 * 開始は Google のアカウントの選択を毎回出す（prompt=select_account）ので、別のアカウントで入り直せる
 */
export function gateStartLink(
  label: string,
  secondary = false,
  options: {
    /** ログインのあとに戻る先（同じサイトのパス。resolveGateCallbackPath を通したもの）。既定は / */
    callbackPath?: string;
    /** リンク先に、このページの URL（Referer）を送らない */
    noReferrer?: boolean;
  } = {}
): string {
  const href = `${GATE_START_PATH}?callbackURL=${encodeURIComponent(options.callbackPath ?? '/')}`;
  return `<a class="action${secondary ? ' secondary' : ''}" href="${escapeHtml(href)}"${options.noReferrer ? ' rel="noreferrer"' : ''}>${escapeHtml(label)}</a>`;
}

/** どのアカウントの話かを示す帯（申請の結果のページ）。入力欄に見えないよう、枠線ではなく地の色で分ける */
export function gateAccountBox(account: string): string {
  return `<p class="account">${escapeHtml(account)}</p>`;
}

export function renderGatePage(content: GatePageContent): {
  status: number;
  html: string;
} {
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
${content.bodyHtml}
</section>
</main>
</body>
</html>
`;
  return { status: content.status, html };
}
