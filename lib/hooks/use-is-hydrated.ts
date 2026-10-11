'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * hydration が終わったか。サーバー描画と hydration 中は false、その後は true を返す。
 *
 * authClient.useSession() は hydration 中にもその時点の値を返す（better-auth の
 * useStore は getServerSnapshot に現在値を渡す）。ストリームで後から届く Suspense の
 * 中身は、セッションの判定が済んでから hydrate されることがあり、サーバー描画
 * （判定中）と属性が食い違う。属性の食い違いを React は直さないため、判定中の
 * 表示（disabled など）はこの値と組み合わせて、hydration 中はサーバーと同じにする
 * （issue #714）
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
