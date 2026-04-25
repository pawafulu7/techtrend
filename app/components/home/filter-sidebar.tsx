'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  Suspense,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'next/navigation';
import { PanelLeft, X } from 'lucide-react';
import { Button } from '@/components/ui-v2/button-v2';
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

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: hydrate from localStorage on mount
      if (saved === 'true') setOpen(true);
    } catch {
      /* SSR or localStorage unavailable */
    }
  }, []);

  // Persist open state to localStorage (skip initial render to avoid overwriting saved value)
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, String(open));
    } catch {
      /* ignore */
    }
  }, [open]);

  const toggle = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
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
      className="relative hidden h-7 px-2 text-xs lg:inline-flex"
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
      <Suspense>
        <FilterActiveIndicator />
      </Suspense>
    </Button>
  );
}

/**
 * URLパラメータからフィルターが適用中かを検出してドットを表示
 */
function FilterActiveIndicator() {
  const searchParams = useSearchParams();

  const sourcesValue = searchParams.get('sources');
  const hasActiveFilters =
    (searchParams.has('sources') && sourcesValue !== 'all') ||
    searchParams.has('sourceId') ||
    searchParams.has('tags') ||
    searchParams.has('tag') ||
    searchParams.has('readFilter') ||
    searchParams.has('dateFrom') ||
    searchParams.has('dateTo') ||
    searchParams.has('dateRange');

  if (!hasActiveFilters) return null;

  return (
    <span
      className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[var(--tt-color-info)]"
      aria-hidden="true"
    />
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
      aria-hidden={!open}
      {...(!open && { inert: true as unknown as boolean })}
    >
      <div className="bg-background/95 flex h-full w-72 flex-col border-r shadow-lg backdrop-blur-sm">
        {/* Close button */}
        <div className="flex flex-shrink-0 items-center justify-between border-b px-4 py-2">
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
        <div className="flex-1 space-y-4 overflow-y-auto p-4">{children}</div>
      </div>
    </aside>
  );
}

/**
 * オーバーレイ背景（クリックで閉じる）
 */
export function FilterSidebarOverlay() {
  const { open, close } = useContext(FilterSidebarContext);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, close]);

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-20 hidden bg-black/20 lg:block"
      onClick={close}
      role="presentation"
    />
  );
}
