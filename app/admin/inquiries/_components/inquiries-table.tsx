'use client';

import { forwardRef } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Pagination } from '@/app/components/common/pagination';
import { formatDateWithTime } from '@/lib/utils/date';
import { cn } from '@/lib/utils';
import { InquiryCategoryBadge, InquiryStatusBadge } from './inquiry-badges';
import type { InquiryListItem } from '../_types';

// 一覧に出す本文の先頭。表示は CSS で1行に切るが、長文を丸ごと DOM に載せない
const PREVIEW_LENGTH = 200;

interface InquiriesTableProps {
  items: InquiryListItem[];
  isLoading: boolean;
  /** 前の結果を出したまま取り直している */
  isFetching: boolean;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** opener は詳細を閉じた後にフォーカスを戻す先 */
  onSelect: (item: InquiryListItem, opener: HTMLElement) => void;
}

function senderLabel(item: InquiryListItem): string {
  if (!item.user) return 'アカウントなし';
  const name = item.user.name || item.user.email;
  return item.user.deletedAt ? `${name}（退会済み）` : name;
}

/**
 * 問い合わせの一覧。行は表の行のまま（role="button" にすると行の中身が読まれなくなる）にし、
 * マウスは行のクリック、キーボードとスクリーンリーダーは内容のセルのボタンで詳細を開く
 */
export const InquiriesTable = forwardRef<HTMLDivElement, InquiriesTableProps>(
  function InquiriesTable(
    { items, isLoading, isFetching, page, totalPages, onPageChange, onSelect },
    ref
  ) {
    if (isLoading) {
      return (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div
          ref={ref}
          tabIndex={-1}
          aria-busy={isFetching || undefined}
          className={cn(
            'rounded-md border transition-opacity outline-none',
            isFetching && 'opacity-60'
          )}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>受信日時</TableHead>
                <TableHead>種別</TableHead>
                <TableHead>内容</TableHead>
                <TableHead>送信者</TableHead>
                <TableHead>状況</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow
                  key={item.id}
                  className="hover:bg-muted/50 cursor-pointer"
                  data-testid="inquiry-row"
                  onClick={(event) => {
                    const opener =
                      event.currentTarget.querySelector<HTMLElement>('button');
                    if (opener) onSelect(item, opener);
                  }}
                >
                  <TableCell className="text-sm text-(--tt-color-text-muted)">
                    {formatDateWithTime(item.createdAt)}
                  </TableCell>
                  <TableCell>
                    <InquiryCategoryBadge category={item.category} />
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="block max-w-[28rem] truncate rounded-sm text-left text-sm font-medium text-(--tt-color-text) hover:underline focus-visible:ring-2 focus-visible:ring-(--tt-color-primary) focus-visible:outline-none"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelect(item, event.currentTarget);
                      }}
                    >
                      {item.message.slice(0, PREVIEW_LENGTH)}
                    </button>
                  </TableCell>
                  <TableCell className="text-sm">{senderLabel(item)}</TableCell>
                  <TableCell>
                    <InquiryStatusBadge status={item.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={onPageChange}
            label="問い合わせのページ"
          />
        )}
      </div>
    );
  }
);
