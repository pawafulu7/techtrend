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
  INQUIRY_STATUSES,
  INQUIRY_STATUS_LABELS,
  isInquiryStatus,
} from '@/lib/inquiries/constants';
import type {
  AdminInquiriesResponse,
  InquiryListItem,
  InquiryStatusFilter,
} from '@/lib/inquiries/types';
import { InquiriesTable } from './inquiries-table';
import { InquiryDetailDialog } from './inquiry-detail-dialog';

const STATUS_FILTERS: readonly InquiryStatusFilter[] = [
  ...INQUIRY_STATUSES,
  'all',
];

function filterLabel(filter: InquiryStatusFilter): string {
  return filter === 'all' ? 'すべて' : INQUIRY_STATUS_LABELS[filter];
}

/** 一覧の取得の失敗。認証・認可の失敗（401・403）を見分けるために status を持つ */
class InquiriesFetchError extends Error {
  constructor(readonly status: number) {
    super(`Failed to fetch inquiries (${status})`);
  }
}

async function fetchInquiries(params: {
  page: number;
  status: InquiryStatusFilter;
  signal?: AbortSignal;
}): Promise<AdminInquiriesResponse> {
  const searchParams = new URLSearchParams({
    page: String(params.page),
    perPage: '20',
  });
  if (params.status !== 'all') searchParams.set('status', params.status);

  const res = await fetch(`/api/admin/inquiries?${searchParams.toString()}`, {
    signal: params.signal,
  });
  if (!res.ok) {
    throw new InquiriesFetchError(res.status);
  }
  return res.json();
}

function isAuthFailure(error: unknown): boolean {
  return (
    error instanceof InquiriesFetchError &&
    (error.status === 401 || error.status === 403)
  );
}

interface InquiriesPageContentProps {
  /** このページを開いた管理者（Server で判定）。ほかのアカウントに替わったらデータを出さない */
  viewerId: string | null;
}

export function InquiriesPageContent({ viewerId }: InquiriesPageContentProps) {
  // ログアウトや別のアカウントへの切り替えでは、問い合わせ（本文・メール）を出し続けない。
  // 一覧のキャッシュは QueryProvider が ['admin'] ごと捨てるが、表示中のデータは
  // ここで描画をやめて消す（判定が済むまでは Server の判定を信じる）
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const isHydrated = useIsHydrated();
  const sessionReady = isHydrated && !sessionPending;
  const viewerChanged =
    sessionReady && (session?.user?.id ?? null) !== viewerId;

  if (viewerChanged) {
    return (
      <ErrorState
        title="ログインの状態が変わりました"
        description="このページを開き直してください。"
        size="compact"
      />
    );
  }

  return <InquiriesList />;
}

function InquiriesList() {
  const [status, setStatus] = useState<InquiryStatusFilter>('OPEN');
  const [page, setPage] = useState(1);
  // 詳細は行のコピーで持つ（状況を変えて一覧から消えても、開いている間は残す）
  const [selected, setSelected] = useState<InquiryListItem | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  // 一覧・空・失敗のどれを出していても残る外枠。閉じた後のフォーカスの戻し先にする
  const regionRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isFetching, isPlaceholderData, error, refetch } =
    useQuery({
      queryKey: ['admin', 'inquiries', { page, status }],
      queryFn: ({ signal }) => fetchInquiries({ page, status, signal }),
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

  // セッションの失効や管理者でなくなったこと（401・403）が分かったら、詳細も閉じる
  if (selected && isAuthFailure(error)) {
    setSelected(null);
  }

  const changeStatus = (next: string) => {
    // 選択中の項目をもう一度押すと Radix は空文字を返すので、無視して選択を保つ
    if (next !== 'all' && !isInquiryStatus(next)) return;
    setStatus(next);
    setPage(1);
  };

  const counts = data?.counts;
  // 前の条件の結果を出している間は、その「0件」を新しい条件の空として出さない
  const showEmpty =
    data !== undefined && !isPlaceholderData && data.data.length === 0;

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

      <div
        ref={regionRef}
        tabIndex={-1}
        className="space-y-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-(--tt-color-primary)"
        data-testid="inquiries-region"
      >
        {error && (
          // 手元にデータがあるとき（裏での取り直しの失敗）は、一覧を隠さずに上に出す
          <ErrorState
            title="問い合わせを読み込めませんでした"
            description="時間をおいてもう一度読み込んでください。"
            onRetry={() => void refetch()}
            size="compact"
          />
        )}
        {showEmpty ? (
          <EmptyState
            icon={Inbox}
            title={
              status === 'all'
                ? '問い合わせはまだありません'
                : `${filterLabel(status)}の問い合わせはありません`
            }
            size="compact"
          />
        ) : error && !data ? null : (
          <InquiriesTable
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
      </div>

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
          // 行が一覧から消えていれば（最後の1件で表ごと消えた場合も）外枠へ戻す
          event.preventDefault();
          const opener = openerRef.current;
          if (opener?.isConnected) {
            opener.focus();
          } else {
            regionRef.current?.focus();
          }
        }}
      />
    </div>
  );
}
