'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth/auth-client';

/**
 * 「better-auth のセッション判定が一度でも解決したか」を保持する共有ラッチ。
 *
 * better-auth のセッション取得は初回解決後にも isPending を true へ戻す
 * （タブ復帰時の再検証、online / broadcast 経由の refresh:
 *  node_modules/better-auth/dist/client/session-refresh.mjs:53-57, 64-68）。
 * この揺れをそのまま TanStack Query の enabled に流すと false→true の再遷移で
 * shouldFetchOptionally 経路が走り、読み込み済み全ページの再取得と一覧 DOM の破棄
 * （スクロール位置喪失）を招く。そのため「一度 false になったら以降 false 固定」に
 * ラッチする。
 *
 * ラッチをフックインスタンス単位（useState）で持つと、新しくマウントされた
 * コンポーネントは必ず「未解決」から始まるため、記事詳細 → ホームのような
 * 再マウント経路でラッチが効かず、同じ再取得が再現する。ラッチしている事実
 * （isPending が一度解決したか）はセッション全体のグローバルな事実であり
 * scope やコンポーネントに固有ではないので、モジュールスコープで共有する。
 */
let hasSessionResolved = false;

// SSR ではモジュールスコープがリクエスト間で共有されるため、サーバー側では
// フラグの読み書きを一切行わず常に「未解決」を返す。
function readLatch(): boolean {
  if (typeof window === 'undefined') return false;
  return hasSessionResolved;
}

function markResolved(): void {
  if (typeof window === 'undefined') return;
  hasSessionResolved = true;
}

/**
 * テスト専用。モジュールスコープのラッチを初期状態へ戻す。
 * 共有状態なので、これを呼ばないとテストケース間でラッチが漏れる。
 */
export function resetSessionResolvedLatchForTests(): void {
  hasSessionResolved = false;
}

/**
 * ラッチ済みの isSessionPending を返す。
 *
 * - セッションが一度でも解決していれば、以降 isPending が true へ戻っても false
 * - まだ一度も解決していなければ isPending をそのまま返す
 *
 * 新しくマウントされたインスタンスでも、既に解決済みなら初回レンダーから false。
 */
export function useIsSessionPendingLatched(): boolean {
  const { isPending } = authClient.useSession();
  // 初期値をモジュールスコープのラッチから取る点が要。これにより再マウントでも
  // 「既に解決済み」が引き継がれる。
  const [resolved, setResolved] = useState(readLatch);

  if (!isPending && !resolved) {
    markResolved();
    // 同一コンポーネントに対するレンダー中の setState（React が許可する形）
    setResolved(true);
  }

  return isPending && !resolved;
}
