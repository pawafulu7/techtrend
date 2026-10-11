'use client';

import { useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';

// 実行中の状態は、ツールバーの「リセット」と空状態の「フィルターをリセット」で共有する。
// インスタンスごとに持つと、一方の実行中にもう一方から押せて DELETE と再同期が重複する
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();
function setInFlight(next: Promise<void> | null) {
  inFlight = next;
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const getIsResetting = () => inFlight !== null;
const getServerIsResetting = () => false;

/**
 * ホームのフィルター条件（検索語・タグ・ソースの条件、保存済みのフィルター Cookie、表示形式）を
 * クリアする。ツールバーの「リセット」と、一覧の空状態の「フィルターをリセット」で同じ処理を使う
 * （issue #701）。パーソナライズの設定は別の API で持つので、ここでは変えない
 */
export function useFilterReset() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isResetting = useSyncExternalStore(
    subscribe,
    getIsResetting,
    getServerIsResetting
  );

  const run = async () => {
    // 2 本の DELETE は独立しているため、片方だけ成功する部分失敗があり得る。
    // その場合でも一部の Cookie は既に消えているので、成否にかかわらず
    // UI とサーバー状態を再同期する（旧実装は throw して再同期を飛ばしていた）
    // Promise.all は片方が reject した時点で先へ進んでしまい、もう一方の DELETE が
    // 完了する前に再同期してしまう。allSettled で両方の決着を待つ
    const results = await Promise.allSettled([
      fetch('/api/filter-preferences', { method: 'DELETE' }),
      fetch('/api/source-filter', { method: 'DELETE' }),
    ]);
    const failed = results.some((r) => r.status === 'rejected' || !r.value.ok);
    if (failed) {
      console.error(
        '[useFilterReset] filter reset did not fully succeed:',
        results.map((r) =>
          r.status === 'rejected' ? `rejected: ${r.reason}` : r.value.status
        )
      );
    }

    // Clear view mode cookie (if exists) — API の成否に依存しない
    document.cookie =
      'article-view-mode=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';

    await queryClient.invalidateQueries();
    router.replace('/');

    if (failed) {
      toast({
        title: 'フィルターのリセットに一部失敗しました',
        description: '残った条件がある場合は時間をおいて再度お試しください。',
        variant: 'destructive',
      });
    }
  };

  const reset = () => {
    if (inFlight) return inFlight;
    const promise = run().finally(() => setInFlight(null));
    setInFlight(promise);
    return promise;
  };

  return { reset, isResetting };
}
