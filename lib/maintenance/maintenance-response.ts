/**
 * Maintenance Mode Response
 *
 * proxy.ts から直接返却するメンテナンス画面（HTTP 503）の単一ソース。
 *
 * 設計上の制約:
 * - proxy.ts は env.ts / React コンポーネントを使えないため、HTML を文字列として保持する。
 * - rewrite ではなく proxy が直接 503 を返すことで「URL 維持 + 503 + Retry-After」を両立する
 *   （Next.js 16 の proxy は rewrite 後の最終ステータスを制御できないため）。
 * - クライアント側のテーマ切替 JS は走らないため、配色は prefers-color-scheme で OS 設定に追従する。
 *
 * デザインは app/not-found.tsx のトーン（中央寄せカード・グラデ背景・丸アイコン枠・
 * primary グリーン #16A34A）をインライン CSS で再現する。
 */

import { NextResponse } from 'next/server';

/** Retry-After ヘッダの秒数（1時間後の再試行を案内） */
const RETRY_AFTER_SECONDS = 3600;

/**
 * メンテナンス画面の HTML 文字列を生成する。
 *
 * lucide-react の Wrench アイコンに相当する SVG をインラインで埋め込む
 * （proxy ランタイムから React アイコンライブラリを使わないため）。
 */
export function renderMaintenanceHtml(): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>メンテナンス中 | TechTrend</title>
<style>
  :root {
    --bg: #ffffff;
    --bg-muted: #f1f5f9;
    --fg: #0f172a;
    --fg-muted: #64748b;
    --primary: #16a34a;
    --primary-bg: rgba(22, 163, 74, 0.12);
    --action-bg: #0f172a;
    --action-fg: #ffffff;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0b1120;
      --bg-muted: #1e293b;
      --fg: #f1f5f9;
      --fg-muted: #94a3b8;
      --primary: #22c55e;
      --primary-bg: rgba(34, 197, 94, 0.16);
      --action-bg: #f1f5f9;
      --action-fg: #0f172a;
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: linear-gradient(to bottom, var(--bg), var(--bg-muted));
    color: var(--fg);
    font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .card { max-width: 28rem; text-align: center; }
  .icon-frame {
    width: 4rem;
    height: 4rem;
    margin: 0 auto 1.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    background: var(--primary-bg);
    color: var(--primary);
  }
  h1 {
    margin: 0 0 0.75rem;
    font-size: 1.5rem;
    font-weight: 600;
    font-family: 'Space Grotesk', 'Inter', system-ui, sans-serif;
  }
  p {
    margin: 0 auto 2rem;
    max-width: 24rem;
    line-height: 1.6;
    color: var(--fg-muted);
  }
  .action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0.75rem 1.5rem;
    border-radius: 0.5rem;
    background: var(--action-bg);
    color: var(--action-fg);
    font-weight: 500;
    text-decoration: none;
    transition: opacity 0.2s ease;
  }
  .action:hover { opacity: 0.9; }
  .action:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
</style>
</head>
<body>
  <main class="card">
    <div class="icon-frame" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
      </svg>
    </div>
    <h1>メンテナンス中です</h1>
    <p>ただいまシステムの整備を行っています。しばらくしてから再度アクセスしてください。</p>
    <a class="action" href="/auth/login">ログイン</a>
  </main>
</body>
</html>`;
}

/**
 * メンテナンス画面を HTTP 503 で直接返す NextResponse を生成する。
 *
 * proxy.ts から呼び出す。rewrite は使わず（URL を維持したまま 503 を返すため）、
 * Content-Type と Retry-After を明示する。セキュリティヘッダは呼び出し側で
 * setSecurityHeaders(res, request) を適用すること。
 */
export function createMaintenanceResponse(): NextResponse {
  return new NextResponse(renderMaintenanceHtml(), {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Retry-After': String(RETRY_AFTER_SECONDS),
      'Cache-Control': 'no-store',
    },
  });
}
