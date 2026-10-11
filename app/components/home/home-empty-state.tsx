'use client';

import { RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui-v2/button-v2';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { EmptyState } from '@/components/ui-v2/empty-state';
import { useFilterReset } from '@/app/components/common/hooks/useFilterReset';

/**
 * ホームの記事一覧が0件のときの表示。ツールバーの「リセット」と同じ処理で
 * フィルターをすべて外せるようにする（issue #701）
 */
export function HomeEmptyState() {
  const { reset, isResetting } = useFilterReset();

  return (
    <div className="flex min-h-[400px] items-center justify-center px-4">
      <CardV2 className="mx-auto max-w-md">
        <EmptyState
          icon={Search}
          title="条件に合う記事はありません"
          description="検索語やフィルターを変えるか、条件をリセットしてください。"
        >
          <Button
            variant="outline"
            onClick={() => void reset()}
            disabled={isResetting}
            className="min-h-[44px]"
          >
            <RotateCcw aria-hidden="true" />
            フィルターをリセット
          </Button>
        </EmptyState>
      </CardV2>
    </div>
  );
}
