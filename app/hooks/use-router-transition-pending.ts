import { useCallback, useLayoutEffect, useOptimistic, useRef } from 'react';

const listeners = new Set<() => void>();

/**
 * App Router の遷移が始まったことを、useRouterTransitionPending を使う画面に伝える。
 * instrumentation-client.ts の onRouterTransitionStart から呼ぶ。Next はそれを、遷移を始める transition の中で
 * 呼ぶ（node_modules/next/dist/client/components/sequential-router-queue.js の navigate・traverse）
 */
export function notifyRouterTransitionStart(): void {
  listeners.forEach((listener) => listener());
}

/**
 * Next の router 遷移（Link・router.push/replace・ブラウザの戻る・進む）の途中かどうかを返す関数。
 * router.refresh や server action は Next が onRouterTransitionStart を呼ばないので含まない。
 *
 * 遷移の終わりは公開の API で知れないので、遷移を始める transition の中で optimistic な state を立てる。
 * React はその transition が commit されたとき（遷移の結果を描いたとき、後の遷移に置き換わったとき）に元の値へ
 * 戻す（next/link の useLinkStatus と同じ仕組み）。true は遷移を始めたタスクの microtask で commit されるので、
 * 後のタスク（キー入力・クリック・取得の完了）から呼べば途中と分かる
 */
export function useRouterTransitionPending(): () => boolean {
  const [pending, setPending] = useOptimistic(false);
  const pendingRef = useRef(false);
  useLayoutEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  // マウントの commit の直後に始まった遷移も受けるよう、layout effect で購読する
  useLayoutEffect(() => {
    const listener = () => setPending(true);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [setPending]);
  return useCallback(() => pendingRef.current, []);
}
