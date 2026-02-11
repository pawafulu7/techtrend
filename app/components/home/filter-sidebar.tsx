'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { PanelLeft, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'home-sidebar-open';

interface FilterSidebarContextValue {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

const FilterSidebarContext = createContext<FilterSidebarContextValue>({
  open: false,
  toggle: () => {},
  close: () => {},
});

export function FilterSidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: hydrate from localStorage on mount
      if (saved === 'true') setOpen(true);
    } catch {
      /* SSR or localStorage unavailable */
    }
  }, []);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, 'false');
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <FilterSidebarContext value={{ open, toggle, close }}>
      {children}
    </FilterSidebarContext>
  );
}

export function FilterSidebarToggle() {
  const { open, toggle } = useContext(FilterSidebarContext);

  return (
    <Button
      variant="outline"
      size="sm"
      className="hidden h-7 px-2 text-xs lg:inline-flex"
      onClick={toggle}
      aria-expanded={open}
      aria-label={open ? 'フィルターを閉じる' : 'フィルターを開く'}
    >
      <PanelLeft
        className={cn(
          'mr-1 h-3 w-3 transition-transform',
          open && 'rotate-180'
        )}
      />
      フィルター
    </Button>
  );
}

/**
 * オーバーレイ式フィルターパネル
 * 記事リストの上に重ねて表示。コンテンツを押さない。
 */
export function FilterSidebarPanel({ children }: { children: ReactNode }) {
  const { open, close } = useContext(FilterSidebarContext);

  return (
    <aside
      className={cn(
        'absolute top-0 left-0 z-30 hidden h-full transition-transform duration-300 ease-out lg:block',
        open ? 'translate-x-0' : '-translate-x-full'
      )}
      data-testid="filter-sidebar"
    >
      <div className="bg-background/95 h-full w-72 border-r shadow-lg backdrop-blur-sm">
        {/* Close button */}
        <div className="flex items-center justify-between border-b px-4 py-2">
          <span className="text-muted-foreground text-xs font-medium">
            フィルター
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={close}
            aria-label="フィルターを閉じる"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="h-[calc(100%-2.5rem)] space-y-4 overflow-y-auto p-4">
          {children}
        </div>
      </div>
    </aside>
  );
}

/**
 * オーバーレイ背景（クリックで閉じる）
 */
export function FilterSidebarOverlay() {
  const { open, close } = useContext(FilterSidebarContext);

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-20 hidden bg-black/20 lg:block"
      onClick={close}
      aria-hidden="true"
    />
  );
}
