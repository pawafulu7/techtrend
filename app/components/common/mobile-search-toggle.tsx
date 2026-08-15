'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { ButtonV2 } from '@/components/ui-v2/button-v2';
import { SearchBox } from '@/app/components/common/search-box';

/**
 * モバイル (<lg) 用のキーワード検索入口。
 * lg以上では常時表示のSearchBoxがあるため非表示にし、
 * モバイルではこのトグルボタンからツールバー直下に全幅のSearchBoxを段階的開示する。
 */
export function MobileSearchToggle() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // 展開時、検索入力へフォーカスを移す
  useEffect(() => {
    if (!open) return;
    const input = panelRef.current?.querySelector<HTMLInputElement>('input');
    input?.focus();
  }, [open]);

  return (
    <>
      <ButtonV2
        type="button"
        variant="outline"
        size="sm"
        iconOnly
        onClick={() => setOpen((prev) => !prev)}
        className="h-9 min-h-[44px] w-9 min-w-[44px] lg:hidden"
        aria-label={open ? '検索を閉じる' : '検索を開く'}
        aria-expanded={open}
        aria-controls={panelId}
        data-testid="mobile-search-toggle"
      >
        {open ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
      </ButtonV2>
      {open && (
        <div
          id={panelId}
          ref={panelRef}
          className="w-full lg:hidden"
          data-testid="mobile-search-panel"
        >
          <SearchBox fullWidth />
        </div>
      )}
    </>
  );
}
