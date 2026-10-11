'use client';

import { RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui-v2/button-v2';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { EmptyState } from '@/components/ui-v2/empty-state';
import { useFilterReset } from '@/app/hooks/use-filter-reset';

/**
 * ホームの記事一覧が0件のときの表示。ツールバーの「リセット」と同じ処理で
 * 検索語・タグ・ソースの条件を外せるようにする（issue #701）。
 * パーソナライズの絞り込みはリセットでは外れないので、効いているときはそのことを示す
 */
export function HomeEmptyState({ personalized }: { personalized: boolean }) {
  const { reset, isResetting } = useFilterReset();

  return (
    <div className="flex min-h-[400px] items-center justify-center px-4">
      <CardV2 className="mx-auto max-w-md">
        <EmptyState
          icon={Search}
          title="条件に合う記事はありません"
          description={
            personalized
              ? 'パーソナライズの絞り込みも効いています。検索語やフィルターをリセットするか、ツールバーの「パーソナライズ」で絞り込みを外してください。'
              : '検索語やフィルターを変えるか、条件をリセットしてください。'
          }
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
