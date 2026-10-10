'use client';

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

interface LazyProps {
  /** モジュールを読み込んでいる間に出すもの */
  fallback: ReactNode;
  /** モジュールを読み込めなかったときに出すもの */
  errorFallback: ReactNode;
}

/**
 * 画面の初回表示に要らない部品を、必要になったときに読む（Issue #718）。
 *
 * next/dynamic（React.lazy）を使わない理由:
 * - React.lazy は先読み済みでも初回の描画で必ず中断する。その後の描き直しが読み込み完了の再試行だけの
 *   ときは、fallback が約 300ms 出る（react-dom の FALLBACK_THROTTLE_MS）。読み込み済みなら最初から
 *   その部品を描きたい
 * - React.lazy は読み込みの失敗を覚えていて、開き直しても読み直さない
 * - loading を渡さない next/dynamic は Suspense 境界を作らず、待ちと失敗が app/loading.tsx・
 *   app/error.tsx まで伝わって画面全体が置き換わる
 *
 * 返す Component の fallback / errorFallback は予約した prop 名で、包む部品には渡さない
 */
export function createLazyComponent<C extends (props: never) => ReactNode>(
  loader: () => Promise<{ default: C }>
) {
  type Props = Parameters<C>[0] & object;
  type Loadable = (props: Props) => ReactNode;
  let loaded: Loadable | null = null;
  let loading: Promise<Loadable> | null = null;
  // 読み込みが終わったら、描いている全部の Lazy に知らせる（失敗した後に別の Lazy が読み直して
  // 成功したときも、先に失敗したものが書式なしのまま残らないように）
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const getSnapshot = () => loaded;
  const getServerSnapshot = () => null;

  const load = () => {
    if (loaded) return Promise.resolve(loaded);
    loading ??= loader().then(
      (mod) => {
        loaded = mod.default as Loadable;
        listeners.forEach((listener) => listener());
        return loaded;
      },
      (error: unknown) => {
        console.error('Failed to load a lazy component:', error);
        loading = null; // 次に描くときに読み直す
        throw error;
      }
    );
    return loading;
  };

  function Lazy(props: Props & LazyProps) {
    // Props は呼び出し側の部品の型なので、ここでは残りを取り分けるために object として扱う
    const { fallback, errorFallback, ...rest } = props as unknown as LazyProps &
      Record<string, unknown>;
    // 型の検査は Lazy の引数（Props & LazyProps）で済んでいるので、描くときは object として渡す
    const Loaded = useSyncExternalStore(
      subscribe,
      getSnapshot,
      getServerSnapshot
    ) as ((props: object) => ReactNode) | null;
    const [failed, setFailed] = useState(false);

    useEffect(() => {
      if (Loaded) return;
      let active = true;
      load().catch(() => {
        if (active) setFailed(true);
      });
      return () => {
        active = false;
      };
    }, [Loaded]);

    if (Loaded) return <Loaded {...rest} />;
    return <>{failed ? errorFallback : fallback}</>;
  }

  return {
    Component: Lazy,
    /** 使う前に読み始める。失敗しても、描くときに読み直す */
    preload: () => {
      load().catch(() => {});
    },
  };
}

/**
 * 読み込めなかったときの案内。閉じて開き直すと読み直す。
 * デプロイの後に古い chunk が無くなったときは、ページの再読み込みが要る
 */
export function LazyLoadFailed({ className }: { className?: string }) {
  return (
    <p
      role="alert"
      className={cn('text-xs text-(--tt-color-text-muted)', className)}
    >
      読み込めませんでした。もう一度開くか、ページを再読み込みしてください
    </p>
  );
}
