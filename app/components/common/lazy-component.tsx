'use client';

import { useEffect, useReducer, useState, type ReactNode } from 'react';
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
 * - React.lazy は先読み済みでも初回の描画で必ず中断し、Suspense の fallback が最短 300ms 出る
 *   （react-dom の FALLBACK_THROTTLE_MS）。読み込み済みなら最初からその部品を描きたい
 * - React.lazy は読み込みの失敗を覚えていて、開き直しても読み直さない
 * - loading を渡さない next/dynamic は Suspense 境界を作らず、待ちと失敗が app/loading.tsx・
 *   app/error.tsx まで伝わって画面全体が置き換わる
 */
export function createLazyComponent<C extends (props: never) => ReactNode>(
  loader: () => Promise<{ default: C }>
) {
  type Props = Parameters<C>[0] & object;
  type Loadable = (props: Props) => ReactNode;
  let loaded: Loadable | null = null;
  let loading: Promise<Loadable> | null = null;

  const load = () => {
    if (loaded) return Promise.resolve(loaded);
    loading ??= loader().then(
      (mod) => (loaded = mod.default as Loadable),
      (error: unknown) => {
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
    const Loaded = loaded as ((props: object) => ReactNode) | null;
    const [, rerender] = useReducer((n: number) => n + 1, 0);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
      if (Loaded) return;
      let active = true;
      load().then(
        () => active && rerender(),
        () => active && setFailed(true)
      );
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

/** 読み込めなかったときの案内。閉じて開き直すと読み直す */
export function LazyLoadFailed({ className }: { className?: string }) {
  return (
    <p
      role="alert"
      className={cn('text-xs text-(--tt-color-text-muted)', className)}
    >
      読み込めませんでした。もう一度開いてください
    </p>
  );
}
