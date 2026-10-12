'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui-v2/button-v2';
import { useToast } from '@/hooks/use-toast';
import { formatDateWithTime } from '@/lib/utils/date';
import {
  INQUIRY_CATEGORY_LABELS,
  INQUIRY_STATUSES,
  INQUIRY_STATUS_LABELS,
  type InquiryStatus,
} from '@/lib/inquiries/constants';
import { InquiryStatusBadge } from './inquiry-badges';
import type { AdminInquiryUpdateResponse, InquiryListItem } from '../_types';

async function updateInquiryStatus(
  id: string,
  status: InquiryStatus
): Promise<InquiryListItem> {
  const res = await fetch(`/api/admin/inquiries/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    throw new Error(`Failed to update inquiry (${res.status})`);
  }
  const json: AdminInquiryUpdateResponse = await res.json();
  return json.data;
}

interface InquiryDetailDialogProps {
  /** 一覧の行のコピー。状況を変えて一覧から消えても、開いている間は残る */
  inquiry: InquiryListItem | null;
  onClose: () => void;
  onUpdated: (updated: InquiryListItem) => void;
  /** 閉じた後のフォーカスの戻し方（親が開いたボタンへ戻す） */
  onCloseAutoFocus: (event: Event) => void;
}

function SenderDetail({ inquiry }: { inquiry: InquiryListItem }) {
  if (!inquiry.user) {
    return <span className="text-(--tt-color-text-muted)">アカウントなし</span>;
  }
  return (
    <span className="break-all">
      {inquiry.user.name
        ? `${inquiry.user.name}（${inquiry.user.email}）`
        : inquiry.user.email}
      {inquiry.user.deletedAt && (
        <span className="text-(--tt-color-text-muted)">（退会済み）</span>
      )}
    </span>
  );
}

export function InquiryDetailDialog({
  inquiry,
  onClose,
  onUpdated,
  onCloseAutoFocus,
}: InquiryDetailDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: InquiryStatus }) =>
      updateInquiryStatus(id, status),
    onSuccess: (updated) => {
      setError(null);
      onUpdated(updated);
      queryClient.invalidateQueries({ queryKey: ['admin', 'inquiries'] });
      toast({
        title: `対応状況を「${INQUIRY_STATUS_LABELS[updated.status]}」にしました`,
      });
    },
    onError: () => {
      setError('対応状況を変えられませんでした。もう一度押してください');
      toast({
        variant: 'destructive',
        title: '対応状況を変えられませんでした',
      });
    },
  });

  const changeStatus = (status: InquiryStatus) => {
    // 処理中と、今と同じ状況は送らない（ボタンは disabled にせず、フォーカスを残す）
    if (!inquiry || mutation.isPending || status === inquiry.status) return;
    mutation.mutate({ id: inquiry.id, status });
  };

  const pendingStatus = mutation.isPending ? mutation.variables?.status : null;

  return (
    <Dialog open={inquiry !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
        onCloseAutoFocus={onCloseAutoFocus}
        data-testid="inquiry-detail-dialog"
      >
        {inquiry && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {INQUIRY_CATEGORY_LABELS[inquiry.category]}
                <InquiryStatusBadge status={inquiry.status} />
              </DialogTitle>
              <DialogDescription>
                {formatDateWithTime(inquiry.createdAt)} に受信
              </DialogDescription>
            </DialogHeader>

            <div className="min-w-0 space-y-4">
              {/* 利用者が書いた生の文字列。React のテキストとして描画し、URL もリンクにしない */}
              <p className="min-w-0 rounded-md border border-(--tt-color-border) bg-(--tt-color-surface-muted) p-3 text-sm leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap text-(--tt-color-text)">
                {inquiry.message}
              </p>

              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-(--tt-color-text-muted)">送信者</dt>
                <dd className="min-w-0">
                  <SenderDetail inquiry={inquiry} />
                </dd>
                <dt className="text-(--tt-color-text-muted)">返信先</dt>
                <dd className="min-w-0">
                  {inquiry.contactEmail ? (
                    <span className="break-all">
                      <a
                        href={`mailto:${inquiry.contactEmail}`}
                        className="text-(--tt-color-primary) underline-offset-2 hover:underline"
                      >
                        {inquiry.contactEmail}
                      </a>
                      {!inquiry.user && (
                        <span className="text-(--tt-color-text-muted)">
                          （本人確認はしていません）
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-(--tt-color-text-muted)">なし</span>
                  )}
                </dd>
              </dl>

              <div className="space-y-2">
                <p
                  id="inquiry-status-label"
                  className="text-sm font-medium text-(--tt-color-text)"
                >
                  対応状況
                </p>
                <div
                  role="group"
                  aria-labelledby="inquiry-status-label"
                  className="flex flex-wrap gap-2"
                >
                  {INQUIRY_STATUSES.map((status) => {
                    const current = status === inquiry.status;
                    const pending = pendingStatus === status;
                    return (
                      <Button
                        key={status}
                        variant={current ? 'primary' : 'outline'}
                        className="min-h-10"
                        aria-pressed={current}
                        aria-disabled={mutation.isPending || undefined}
                        data-disabled={
                          mutation.isPending && !pending ? 'true' : undefined
                        }
                        onClick={() => changeStatus(status)}
                      >
                        {pending && (
                          <Loader2
                            className="h-4 w-4 animate-spin"
                            aria-hidden="true"
                          />
                        )}
                        {INQUIRY_STATUS_LABELS[status]}
                      </Button>
                    );
                  })}
                </div>
                {error && (
                  <p
                    role="alert"
                    className="rounded-md border border-(--tt-color-negative-border) bg-(--tt-color-negative-bg) px-3 py-2 text-sm text-(--tt-color-negative)"
                  >
                    {error}
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
