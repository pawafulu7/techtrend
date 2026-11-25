'use client';

import { useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui-v2/badge-v2';
import { Button } from '@/components/ui-v2/button-v2';
import { ErrorState } from '@/components/ui-v2/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/app/hooks/use-toast';
import type { GateAccessRequestEntry } from '@/lib/auth/site-gate/admin-types';
import {
  gateAccessRequestsQueryKey,
  gateAccessRequestsQueryOptions,
  isGateAccessRequestsAuthFailure,
} from '@/lib/auth/site-gate/admin-request-query';
import { GateAllowlistActionError, gateAllowlistQueryKey } from './gate-allowlist-api';
import { APPROVE_FAILED_MESSAGE, approveGateRequest } from './gate-requests-api';
import { GateRequestRejectDialog } from './gate-request-reject-dialog';

function formatRequestedDate(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString('ja-JP');
}

/**
 * 入口で未登録と拒否された人からの、利用の申請（対応待ち）。許可すると許可リストに入り、申請は消える。
 * 自動では許可しない（2026-11-25 のユーザーの決定）
 */
export function GateRequestSection() {
  const headingId = useId();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [rejecting, setRejecting] = useState<GateAccessRequestEntry | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const regionRef = useRef<HTMLElement>(null);

  // 取得の設定はメニューの件数と共通（lib/auth/site-gate/admin-request-query.ts）
  const { data, isLoading, error, refetch } = useQuery(gateAccessRequestsQueryOptions);

  const approve = useMutation({
    mutationFn: (request: GateAccessRequestEntry) => approveGateRequest(request.id),
    networkMode: 'always',
    // 失敗しても両方の一覧を取り直す（許可が済んだ後に応答だけ失われたとき・すでに対応済みだったとき）
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: gateAccessRequestsQueryKey }),
        queryClient.invalidateQueries({ queryKey: gateAllowlistQueryKey }),
      ]),
  });

  // セッションの失効や管理者でなくなったこと（401・403）が分かったら、却下の確認も閉じる
  // （閉じないと、あとで取得が戻ったときに確認のダイアログが勝手に開き直す）
  if (rejecting && isGateAccessRequestsAuthFailure(error)) {
    setRejecting(null);
  }

  // 401・403 の案内は、同じ画面の許可リストの側（gate-access-content.tsx）が画面全体に出す
  // （許可・却下のあとは許可リストも取り直すので、そちらも同じ失敗になって案内が出る）
  if (isGateAccessRequestsAuthFailure(error)) return null;

  const requests = data?.requests ?? [];

  const onApprove = (request: GateAccessRequestEntry) => {
    if (approve.isPending) return;
    setActionError(null);
    approve.mutate(request, {
      onSuccess: (result) => {
        toast({
          title:
            result.status === 'already_allowed'
              ? `${result.email} はすでに許可されています`
              : `${result.email} を許可しました`,
        });
        // 行が消えるので、フォーカスを区画へ戻す
        regionRef.current?.focus();
      },
      onError: (cause) => {
        setActionError(
          cause instanceof GateAllowlistActionError ? cause.message : APPROVE_FAILED_MESSAGE
        );
        // すでに対応済みで、取り直した一覧から申請が消えていたら、フォーカスを区画へ戻す。
        // 画面の行はこの時点ではまだ消えていない（再描画の前）ので、取り直した一覧で判断する
        const stillListed =
          queryClient
            // キーは取得の設定のものを使う（一覧の型が付いている）
            .getQueryData(gateAccessRequestsQueryOptions.queryKey)
            ?.requests.some((row) => row.id === request.id) ?? false;
        if (!stillListed) regionRef.current?.focus();
      },
    });
  };

  return (
    <section
      ref={regionRef}
      tabIndex={-1}
      aria-labelledby={headingId}
      className="space-y-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-(--tt-color-primary)"
      data-testid="gate-request-section"
    >
      <div>
        <div className="flex items-center gap-2">
          <h2 id={headingId} className="text-h3">
            利用の申請
          </h2>
          {requests.length > 0 && (
            <Badge variant="info" data-testid="gate-request-count">
              {`${requests.length} 件`}
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          未登録のアカウントでログインしようとした人からの申請です。許可すると、そのアドレスの
          Google アカウントでサイトに入れるようになります。アドレスと備考は、申請者が入力したものです。
        </p>
      </div>

      {error && (
        <ErrorState
          title="申請を読み込めませんでした"
          description="時間をおいてもう一度読み込んでください。"
          onRetry={() => void refetch()}
          size="compact"
        />
      )}
      {actionError && (
        <p
          role="alert"
          className="text-sm text-(--tt-color-negative)"
          data-testid="gate-request-error"
        >
          {actionError}
        </p>
      )}

      {isLoading ? (
        <div aria-busy="true" aria-label="申請を読み込んでいます">
          <Skeleton className="h-10 w-full" />
        </div>
      ) : data && requests.length === 0 ? (
        <p
          className="text-muted-foreground rounded-md border px-4 py-6 text-center text-sm"
          data-testid="gate-request-empty"
        >
          届いている申請はありません
        </p>
      ) : data ? (
        // 狭い幅（390px など）では申請日の列を隠し、操作のボタンが横スクロールの先に隠れないようにする
        <div className="@container rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>アカウント</TableHead>
                <TableHead className="hidden @md:table-cell">申請日</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => {
                const approving = approve.isPending && approve.variables?.id === request.id;
                return (
                  <TableRow key={request.id} data-testid="gate-request-row">
                    <TableCell className="whitespace-normal">
                      <div className="font-medium break-all">{request.email}</div>
                      {request.note && (
                        // 申請者が書いた生の文字列。React のテキストとして出す（HTML として解釈させない）
                        <p className="text-muted-foreground mt-1 text-sm break-words whitespace-pre-wrap">
                          {request.note}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden align-top @md:table-cell">
                      {formatRequestedDate(request.createdAt)}
                    </TableCell>
                    <TableCell className="text-right align-top">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          size="sm"
                          onClick={() => onApprove(request)}
                          loading={approving}
                          disabled={approve.isPending && !approving}
                          aria-label={`${request.email} を許可`}
                        >
                          許可する
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(event) => {
                            openerRef.current = event.currentTarget;
                            setActionError(null);
                            setRejecting(request);
                          }}
                          disabled={approve.isPending}
                          aria-label={`${request.email} の申請を却下`}
                          className="text-(--tt-color-negative) hover:opacity-80"
                        >
                          却下
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <GateRequestRejectDialog
        request={rejecting}
        onClose={() => setRejecting(null)}
        onCloseAutoFocus={(event) => {
          // 状態で開閉しているので Radix は戻し先を知らない。開いたボタンへ戻し、
          // 行が一覧から消えていれば区画へ戻す
          event.preventDefault();
          const opener = openerRef.current;
          if (opener?.isConnected) {
            opener.focus();
          } else {
            regionRef.current?.focus();
          }
        }}
      />
    </section>
  );
}
