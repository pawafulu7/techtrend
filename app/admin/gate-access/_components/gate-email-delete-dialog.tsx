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
import { GATE_ALLOW_CACHE_TTL_SEC } from '@/lib/auth/site-gate/constants';
import type { GateAllowlistEntry } from '@/lib/auth/site-gate/admin-types';
import {
  GateAllowlistActionError,
  REMOVE_FAILED_MESSAGE,
  gateAllowlistQueryKey,
  removeGateEmail,
} from './gate-allowlist-api';

interface GateEmailDeleteDialogProps {
  entry: GateAllowlistEntry | null;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
}

export function GateEmailDeleteDialog({
  entry,
  onClose,
  onCloseAutoFocus,
}: GateEmailDeleteDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (id: string) => removeGateEmail(id),
    // オフラインでも一時停止させずにすぐ失敗させる（一時停止すると送信中のままになり、ダイアログを閉じられない）
    networkMode: 'always',
    // 失敗しても一覧を取り直す（削除が済んだ後に応答だけ失われたとき・すでに消えていたとき）。
    // 取り直しが終わってから閉じる（閉じた直後に消えたはずの行が残って見えないように）
    onSettled: () => queryClient.invalidateQueries({ queryKey: gateAllowlistQueryKey }),
  });

  const close = () => {
    mutation.reset();
    setError(null);
    onClose();
  };

  const confirm = () => {
    if (!entry?.id || mutation.isPending) return;
    const email = entry.email;
    setError(null);
    mutation.mutate(entry.id, {
      onSuccess: () => {
        toast({ title: `${email} を削除しました` });
        close();
      },
      onError: (cause) => {
        setError(
          cause instanceof GateAllowlistActionError ? cause.message : REMOVE_FAILED_MESSAGE
        );
      },
    });
  };

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && !mutation.isPending && close()}>
      <DialogContent
        onInteractOutside={(event) => mutation.isPending && event.preventDefault()}
        onEscapeKeyDown={(event) => mutation.isPending && event.preventDefault()}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>アドレスを削除</DialogTitle>
          <DialogDescription className="break-all">
            {`${entry?.email ?? ''} を一覧から削除します。このアカウントは ${GATE_ALLOW_CACHE_TTL_SEC} 秒ほどでサイトに入れなくなります。`}
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
            data-testid="gate-email-delete-confirm"
          >
            削除する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
