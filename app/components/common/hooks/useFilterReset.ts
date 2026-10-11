'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';

/**
 * ホームのフィルター条件をすべてクリアする。ツールバーの「リセット」と、
 * 一覧の空状態の「フィルターをリセット」で同じ処理を使う（issue #701）
 */
export function useFilterReset() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isResetting, setIsResetting] = useState(false);

  const reset = async () => {
    if (isResetting) return;
    setIsResetting(true);

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

    try {
      await queryClient.invalidateQueries();
      router.replace('/');
    } finally {
      setIsResetting(false);
    }

    if (failed) {
      toast({
        title: 'フィルターのリセットに一部失敗しました',
        description: '残った条件がある場合は時間をおいて再度お試しください。',
        variant: 'destructive',
      });
    }
  };

  return { reset, isResetting };
}
