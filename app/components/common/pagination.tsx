'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui-v2/button-v2';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** nav の名前。1画面に2つ置くときは区別できる名前を渡す */
  label?: string;
}

type PageItem = number | 'ellipsis-start' | 'ellipsis-end';

const SHOW_PAGES = 5; // 番号ボタンを全部出す上限

/** 先頭と末尾は常に出し、現在のページの前後1つを間に出す */
function getPageItems(currentPage: number, totalPages: number): PageItem[] {
  if (totalPages <= SHOW_PAGES) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const items: PageItem[] = [1];
  if (currentPage > 3) {
    items.push('ellipsis-start');
  }
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  for (let i = start; i <= end; i++) {
    items.push(i);
  }
  if (currentPage < totalPages - 2) {
    items.push('ellipsis-end');
  }
  items.push(totalPages);
  return items;
}

/**
 * ページ送りの唯一の実装（issue #710 で ui/pagination・server-pagination を統合）。
 * 狭い画面では「前へ」「次へ」を読み上げ用だけにし、ボタンを詰めて1行に収める
 */
export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  label = 'ページ送り',
}: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav
      className="flex flex-wrap items-center justify-center gap-1 sm:gap-2"
      aria-label={label}
      data-testid="pagination-container"
    >
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="max-sm:px-2"
        data-testid="pagination-prev"
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="sr-only sm:not-sr-only">前へ</span>
      </Button>

      <div className="flex flex-wrap items-center justify-center gap-1">
        {getPageItems(currentPage, totalPages).map((page) => (
          <div key={page}>
            {typeof page === 'number' ? (
              <Button
                variant={currentPage === page ? 'default' : 'outline'}
                size="sm"
                onClick={() => onPageChange(page)}
                className="min-w-8 px-2 sm:min-w-[40px] sm:px-3"
                aria-current={currentPage === page ? 'page' : undefined}
                data-testid={
                  currentPage === page
                    ? 'pagination-current'
                    : `pagination-button-${page}`
                }
              >
                {page}
              </Button>
            ) : (
              <span
                className="text-muted-foreground px-1 sm:px-3"
                aria-hidden="true"
              >
                ...
              </span>
            )}
          </div>
        ))}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="max-sm:px-2"
        data-testid="pagination-next"
      >
        <span className="sr-only sm:not-sr-only">次へ</span>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </nav>
  );
}
