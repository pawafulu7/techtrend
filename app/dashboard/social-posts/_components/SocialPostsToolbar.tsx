'use client';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SocialPostStatus, SocialPostSource } from '@/lib/social-post';

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
}: SocialPostsToolbarProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
          <SelectTrigger className="w-[180px]">
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
          <SelectTrigger className="w-[180px]">
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
      <div className="flex flex-wrap gap-2">
        {selectedCount > 0 && (
          <>
            <span className="text-muted-foreground self-center text-sm">
              {selectedCount}件選択中
            </span>
            <Select
              onValueChange={(value) => {
                if (value === 'delete') {
                  onBulkAction('delete');
                } else {
                  onBulkAction('changeStatus', value as SocialPostStatus);
                }
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="一括操作" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="REVIEWED">レビュー済にする</SelectItem>
                <SelectItem value="ARCHIVED">アーカイブ</SelectItem>
                <SelectItem value="delete">削除</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}

        <Button onClick={onGenerateClick}>
          <PlusIcon className="mr-2 h-4 w-4" />
          投稿を生成
        </Button>
      </div>
    </div>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
