'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui-v2/button-v2';
import { useToast } from '@/app/hooks/use-toast';
import type { GateAccessRequestEntry } from '@/lib/auth/site-gate/admin-types';
import { gateAccessRequestsQueryKey } from '@/lib/auth/site-gate/admin-request-query';
import { GateAllowlistActionError, gateAllowlistQueryKey } from './gate-allowlist-api';
import { REJECT_FAILED_MESSAGE, rejectGateRequest } from './gate-requests-api';

interface GateRequestRejectDialogProps {
  request: GateAccessRequestEntry | null;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
}

export function GateRequestRejectDialog({
  request,
  onClose,
  onCloseAutoFocus,
}: GateRequestRejectDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (id: string) => rejectGateRequest(id),
    // オフラインでも一時停止させずにすぐ失敗させる（一時停止すると送信中のままになり、ダイアログを閉じられない）
    networkMode: 'always',
    // 失敗しても一覧を取り直す（却下が済んだ後に応答だけ失われたとき・すでに対応済みだったとき）。
    // 取り直しが終わってから閉じる（閉じた直後に消えたはずの行が残って見えないように）。
    // 許可リストも取り直す（401・403 のとき、画面全体の案内を許可リストの側が出すため。許可と同じ）
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: gateAccessRequestsQueryKey }),
        queryClient.invalidateQueries({ queryKey: gateAllowlistQueryKey }),
      ]),
  });

  const close = () => {
    mutation.reset();
    setError(null);
    onClose();
  };

  const confirm = () => {
    if (!request || mutation.isPending) return;
    const email = request.email;
    setError(null);
    mutation.mutate(request.id, {
      onSuccess: () => {
        toast({ title: `${email} の申請を却下しました` });
        close();
      },
      onError: (cause) => {
        setError(
          cause instanceof GateAllowlistActionError ? cause.message : REJECT_FAILED_MESSAGE
        );
      },
    });
  };

  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && !mutation.isPending && close()}>
      <DialogContent
        onInteractOutside={(event) => mutation.isPending && event.preventDefault()}
        onEscapeKeyDown={(event) => mutation.isPending && event.preventDefault()}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>申請を却下</DialogTitle>
          <DialogDescription className="break-all">
            {`${request?.email ?? ''} の申請を一覧から消します。このアカウントはサイトに入れないままです。`}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div
            role="alert"
            className="rounded-md border border-(--tt-color-negative-border) bg-(--tt-color-negative-bg) p-3 text-sm text-(--tt-color-negative)"
          >
            {error}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={mutation.isPending}>
            キャンセル
          </Button>
          <Button
            variant="destructive"
            onClick={confirm}
            loading={mutation.isPending}
            data-testid="gate-request-reject-confirm"
          >
            却下する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
