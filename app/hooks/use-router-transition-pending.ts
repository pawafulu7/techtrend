import {
  useEffect,
  useLayoutEffect,
  useOptimistic,
  useRef,
  type RefObject,
} from 'react';

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
 * Next の router 遷移（Link・router.push/replace・ブラウザの戻る・進む）の途中かどうか。途中は ref が true。
 *
 * 遷移の終わりは公開の API で知れないので、遷移を始める transition の中で optimistic な state を立てる。
 * React はその transition が commit されたとき（遷移の結果を描いたとき、後の遷移に置き換わったとき）に元の値へ
 * 戻す（next/link の useLinkStatus と同じ仕組み）。ref はイベントハンドラから読むために commit のたびに合わせる
 */
export function useRouterTransitionPending(): RefObject<boolean> {
  const [pending, setPending] = useOptimistic(false);
  const pendingRef = useRef(false);
  useLayoutEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(() => {
    const listener = () => setPending(true);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [setPending]);
  return pendingRef;
}
