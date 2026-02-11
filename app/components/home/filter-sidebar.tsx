'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'home-sidebar-open';

interface FilterSidebarContextValue {
  open: boolean;
  toggle: () => void;
}

const FilterSidebarContext = createContext<FilterSidebarContextValue>({
  open: false,
  toggle: () => {},
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

  return (
    <FilterSidebarContext value={{ open, toggle }}>
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

export function FilterSidebarPanel({ children }: { children: ReactNode }) {
  const { open } = useContext(FilterSidebarContext);

  return (
    <aside
      className={cn(
        'hidden flex-shrink-0 overflow-hidden border-r transition-all duration-300 lg:block',
        open ? 'lg:w-64' : 'lg:w-0 lg:border-r-0'
      )}
      data-testid="filter-sidebar"
    >
      <div className="h-full w-64 space-y-4 overflow-y-auto p-4">
        {children}
      </div>
    </aside>
  );
}
