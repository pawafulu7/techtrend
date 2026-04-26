'use client';

import { Button } from '@/components/ui-v2/button-v2';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type {
  SocialPostStatus,
  SocialPostSource,
} from '@/lib/social-post/types';

interface FiltersState {
  status: SocialPostStatus | 'all';
  source: SocialPostSource | 'all';
  page: number;
}

interface SocialPostsToolbarProps {
  filters: FiltersState;
  onFilterChange: (filters: Partial<FiltersState>) => void;
  selectedCount: number;
  onBulkAction: (
    action: 'changeStatus' | 'delete',
    status?: SocialPostStatus
  ) => void;
  onGenerateClick: () => void;
  isProcessing?: boolean;
}

const STATUS_OPTIONS: Array<{
  value: SocialPostStatus | 'all';
  label: string;
}> = [
  { value: 'all', label: 'すべてのステータス' },
  { value: 'DRAFT', label: '下書き' },
  { value: 'REVIEWED', label: 'レビュー済' },
  { value: 'SCHEDULED', label: '予約済' },
  { value: 'POSTED', label: '投稿完了' },
  { value: 'FAILED', label: '失敗' },
  { value: 'ARCHIVED', label: 'アーカイブ' },
];

const SOURCE_OPTIONS: Array<{
  value: SocialPostSource | 'all';
  label: string;
}> = [
  { value: 'all', label: 'すべてのソース' },
  { value: 'ARTICLE', label: '記事' },
  { value: 'DAILY_TREND', label: 'Daily Trend' },
  { value: 'DIFF_SUMMARY', label: 'Diff Summary' },
  { value: 'MANUAL', label: '手動作成' },
];

export function SocialPostsToolbar({
  filters,
  onFilterChange,
  selectedCount,
  onBulkAction,
  onGenerateClick,
  isProcessing = false,
}: SocialPostsToolbarProps) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-[var(--tt-color-border)] bg-[var(--tt-color-surface)] p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select
          value={filters.status}
          onValueChange={(value) =>
            onFilterChange({
              status: value as SocialPostStatus | 'all',
              page: 1,
            })
          }
        >
          <SelectTrigger className="w-[160px] border-[var(--tt-color-border)] bg-[var(--tt-color-surface-muted)]">
            <SelectValue placeholder="ステータス" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.source}
          onValueChange={(value) =>
            onFilterChange({
              source: value as SocialPostSource | 'all',
              page: 1,
            })
          }
        >
          <SelectTrigger className="w-[160px] border-[var(--tt-color-border)] bg-[var(--tt-color-surface-muted)]">
            <SelectValue placeholder="ソース" />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {selectedCount > 0 && (
          <>
            <span className="rounded-full bg-[var(--tt-color-status-reviewed-icon-bg)] px-3 py-1 text-sm font-medium text-[var(--tt-color-status-reviewed-text)]">
              {selectedCount}件選択中
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isProcessing}
                  className="border-[var(--tt-color-border)]"
                >
                  {isProcessing ? (
                    <>
                      <LoadingIcon className="mr-2 h-4 w-4 animate-spin" />
                      処理中...
                    </>
                  ) : (
                    <>
                      <MoreIcon className="mr-2 h-4 w-4" />
                      一括操作
                    </>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => onBulkAction('changeStatus', 'REVIEWED')}
                >
                  <CheckCircleIcon className="mr-2 h-4 w-4 text-[var(--tt-color-status-reviewed-text)]" />
                  レビュー済にする
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onBulkAction('changeStatus', 'ARCHIVED')}
                >
                  <ArchiveIcon className="mr-2 h-4 w-4 text-[var(--tt-color-text-muted)]" />
                  アーカイブ
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onBulkAction('delete')}
                  className="text-[var(--tt-color-negative)] focus:text-[var(--tt-color-negative)]"
                >
                  <TrashIcon className="mr-2 h-4 w-4" />
                  削除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}

        <Button
          onClick={onGenerateClick}
          className="bg-[var(--tt-color-info)] text-white shadow-md transition-all hover:opacity-90 hover:shadow-lg"
        >
          <PlusIcon className="mr-2 h-4 w-4" />
          投稿を生成
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Icons
// =============================================================================

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

function MoreIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
      />
    </svg>
  );
}

function LoadingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function ArchiveIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
      />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}
