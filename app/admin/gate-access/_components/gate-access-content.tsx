'use client';

import { useRef, useState } from 'react';
import { useQuery, type Query } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui-v2/error-state';
import { SiteGateReopenState } from '@/app/components/common/site-gate-reopen-state';
import { authClient } from '@/lib/auth/auth-client';
import { useIsHydrated } from '@/app/hooks/use-is-hydrated';
import type {
  GateAllowlistEntry,
  GateAllowlistResponse,
} from '@/lib/auth/site-gate/admin-types';
import {
  GateAllowlistFetchError,
  fetchGateAllowlist,
  gateAllowlistQueryKey,
} from './gate-allowlist-api';
import { GateEmailAddForm } from './gate-email-add-form';
import { GateEmailDeleteDialog } from './gate-email-delete-dialog';
import { GateEmailTable } from './gate-email-table';

interface GateAccessContentProps {
  /** このページを開いた管理者（Server で判定）。ほかのアカウントに替わったらデータを出さない */
  viewerId: string | null;
}

export function GateAccessContent({ viewerId }: GateAccessContentProps) {
  // ログアウトや別のアカウントへの切り替えでは、アドレスの一覧を出し続けない。
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

  return <GateAccessManager />;
}

function isAuthFailure(error: unknown): boolean {
  return (
    error instanceof GateAllowlistFetchError &&
    (error.status === 401 || error.status === 403)
  );
}

/** 再接続・フォーカスで取り直すか。401・403 の間は取り直さない（retry の説明と同じ理由） */
function canRefetchAutomatically(query: Query<GateAllowlistResponse>): boolean {
  return !isAuthFailure(query.state.error);
}

function GateAccessManager() {
  const [deleting, setDeleting] = useState<GateAllowlistEntry | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  // 一覧・空・失敗のどれを出していても残る外枠。ダイアログを閉じた後のフォーカスの戻し先にする
  const regionRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: gateAllowlistQueryKey,
    queryFn: ({ signal }) => fetchGateAllowlist(signal),
    // オフラインでも一時停止させずにすぐ失敗させる（削除のあとの取り直しが止まると、確認のダイアログを閉じられない）
    networkMode: 'always',
    // networkMode が always だと再接続での取り直しが既定で切れるので、明示して戻す（オフラインで失敗した一覧を自動で直す）
    refetchOnReconnect: canRefetchAutomatically,
    // 別の管理者の変更も、タブに戻れば出るようにする（既定は 5 分・フォーカスで取り直さない）
    staleTime: 30_000,
    refetchOnWindowFocus: canRefetchAutomatically,
    // 401・403 は取り直しても入り直す（開き直す）まで同じ。data が無いと取り直しの間は error が消え、
    // 案内の代わりに読み込み中の表示が一瞬出るので、自動では取り直さない
    retry: (failureCount, cause) => !isAuthFailure(cause) && failureCount < 1,
  });

  // セッションの失効や管理者でなくなったこと（401・403）が分かったら、確認のダイアログも閉じる
  if (deleting && isAuthFailure(error)) {
    setDeleting(null);
  }

  // ログイン状態が切れた・管理者でなくなった・入口が切れた（401・403）: 手元の一覧と追加欄は出さない
  if (isAuthFailure(error)) {
    if (error instanceof GateAllowlistFetchError && error.siteGate) {
      return <SiteGateReopenState />;
    }
    return (
      <ErrorState
        title="この画面を表示できません"
        description={
          error instanceof GateAllowlistFetchError && error.status === 403
            ? 'この画面には管理者の権限が必要です。'
            : 'ログインの有効期限が切れました。もう一度ログインしてから開き直してください。'
        }
        size="block"
      />
    );
  }

  const unavailable = isLoading || (error !== null && data === undefined);
  const hasFixed = data?.entries.some((row) => row.isFixed) ?? false;

  return (
    <div className="space-y-6">
      {data && !data.gateEnabled && (
        <p
          className="rounded-md border border-(--tt-color-info-border) bg-(--tt-color-info-bg) px-3 py-2 text-sm text-(--tt-color-info)"
          data-testid="gate-disabled-note"
        >
          今は Google
          ログインの入口が無効です。有効にすると、この一覧が使われます。
        </p>
      )}

      <GateEmailAddForm disabled={unavailable} />

      <div
        ref={regionRef}
        tabIndex={-1}
        className="space-y-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-(--tt-color-primary)"
        data-testid="gate-allowlist-region"
      >
        {error && (
          // 手元にデータがあるとき（裏での取り直しの失敗）は、一覧を隠さずに上に出す
          <ErrorState
            title="一覧を読み込めませんでした"
            description="時間をおいてもう一度読み込んでください。"
            onRetry={() => void refetch()}
            size="compact"
          />
        )}
        {isLoading ? (
          <div
            className="space-y-2"
            aria-busy="true"
            aria-label="一覧を読み込んでいます"
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : data ? (
          <>
            <GateEmailTable
              rows={data.entries}
              onRequestDelete={(row, opener) => {
                openerRef.current = opener;
                setDeleting(row);
              }}
            />
            {hasFixed && (
              <p className="text-muted-foreground text-sm">
                {'「設定で固定」のアドレスは Vercel の環境変数（GATE_ALWAYS_ALLOWED_EMAILS）で指定しているため、ここでは削除できません。'}
              </p>
            )}
          </>
        ) : null}
      </div>

      <GateEmailDeleteDialog
        entry={deleting}
        onClose={() => setDeleting(null)}
        onCloseAutoFocus={(event) => {
          // 状態で開閉しているので Radix は戻し先を知らない。開いたボタンへ戻し、
          // 行が一覧から消えていれば外枠へ戻す
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
