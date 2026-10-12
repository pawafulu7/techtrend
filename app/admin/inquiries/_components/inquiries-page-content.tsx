'use client';

import { useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { EmptyState } from '@/components/ui-v2/empty-state';
import { ErrorState } from '@/components/ui-v2/error-state';
import { authClient } from '@/lib/auth/auth-client';
import { useIsHydrated } from '@/lib/hooks/use-is-hydrated';
import {
  INQUIRY_STATUS_LABELS,
  isInquiryStatus,
} from '@/lib/inquiries/constants';
import { InquiriesTable } from './inquiries-table';
import { InquiryDetailDialog } from './inquiry-detail-dialog';
import type {
  AdminInquiriesResponse,
  InquiryListItem,
  InquiryStatusFilter,
} from '../_types';

const STATUS_FILTERS: InquiryStatusFilter[] = [
  'OPEN',
  'IN_PROGRESS',
  'RESOLVED',
  'all',
];

function filterLabel(filter: InquiryStatusFilter): string {
  return filter === 'all' ? 'すべて' : INQUIRY_STATUS_LABELS[filter];
}

async function fetchInquiries(params: {
  page: number;
  status: InquiryStatusFilter;
}): Promise<AdminInquiriesResponse> {
  const searchParams = new URLSearchParams({
    page: String(params.page),
    perPage: '20',
  });
  if (params.status !== 'all') searchParams.set('status', params.status);

  const res = await fetch(`/api/admin/inquiries?${searchParams.toString()}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch inquiries (${res.status})`);
  }
  return res.json();
}

export function InquiriesPageContent() {
  const [status, setStatus] = useState<InquiryStatusFilter>('OPEN');
  const [page, setPage] = useState(1);
  // 詳細は行のコピーで持つ（状況を変えて一覧から消えても、開いている間は残す）
  const [selected, setSelected] = useState<InquiryListItem | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isFetching, isPlaceholderData, error, refetch } =
    useQuery({
      queryKey: ['admin', 'inquiries', { page, status }],
      queryFn: () => fetchInquiries({ page, status }),
      placeholderData: keepPreviousData,
      // 開いたままでも、タブに戻れば新着が出るようにする（既定は 5 分・フォーカスで取り直さない）
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    });

  // 最後の1件を処理して今のページが無くなったら、残っている最後のページに移る。
  // 前の条件の結果（placeholder）では判断しない
  const totalPages = data?.pagination.totalPages ?? 1;
  if (data && !isPlaceholderData && page > totalPages) {
    setPage(totalPages);
  }

  // ログアウトやセッションの失効では、開いている詳細（本文・メール）も閉じる。
  // 一覧のキャッシュは QueryProvider が ['admin'] ごと捨てる
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const isHydrated = useIsHydrated();
  if (selected && isHydrated && !sessionPending && !session) {
    setSelected(null);
  }

  const changeStatus = (next: string) => {
    // 選択中の項目をもう一度押すと Radix は空文字を返すので、無視して選択を保つ
    if (next !== 'all' && !isInquiryStatus(next)) return;
    setStatus(next);
    setPage(1);
  };

  const counts = data?.counts;

  return (
    <div className="space-y-4">
      <ToggleGroup
        type="single"
        variant="outline"
        value={status}
        onValueChange={changeStatus}
        aria-label="対応状況で絞り込む"
        className="flex-wrap"
      >
        {STATUS_FILTERS.map((filter) => (
          <ToggleGroupItem
            key={filter}
            value={filter}
            className="data-[state=on]:border-tt-primary-border data-[state=on]:bg-tt-primary-bg data-[state=on]:text-tt-primary gap-1.5 px-3"
            data-testid={`inquiry-filter-${filter}`}
          >
            {filterLabel(filter)}
            <span className="text-xs tabular-nums opacity-80">
              {counts ? counts[filter] : '–'}
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {error ? (
        <ErrorState
          title="問い合わせを読み込めませんでした"
          description="時間をおいてもう一度読み込んでください。"
          onRetry={() => void refetch()}
          size="compact"
        />
      ) : data && data.data.length === 0 && !isLoading ? (
        <EmptyState
          icon={Inbox}
          title={
            status === 'all'
              ? '問い合わせはまだありません'
              : `${filterLabel(status)}の問い合わせはありません`
          }
          size="compact"
        />
      ) : (
        <InquiriesTable
          ref={tableRef}
          items={data?.data ?? []}
          isLoading={isLoading}
          isFetching={isFetching && isPlaceholderData}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          onSelect={(item, opener) => {
            openerRef.current = opener;
            setSelected(item);
          }}
        />
      )}

      <InquiryDetailDialog
        inquiry={selected}
        onClose={() => setSelected(null)}
        onUpdated={(updated) => {
          // 閉じた後や別の行を開いた後に遅れて返った応答では、詳細を変えない
          setSelected((current) =>
            current?.id === updated.id ? updated : current
          );
        }}
        onCloseAutoFocus={(event) => {
          // 状態で開閉しているので Radix は戻し先を知らない。開いたボタンへ戻し、
          // 行が一覧から消えていれば表の外枠へ戻す
          event.preventDefault();
          const opener = openerRef.current;
          if (opener?.isConnected) {
            opener.focus();
          } else {
            tableRef.current?.focus();
          }
        }}
      />
    </div>
  );
}
