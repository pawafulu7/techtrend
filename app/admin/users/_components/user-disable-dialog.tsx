'use client';

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
import { Loader2 } from 'lucide-react';
import type { AdminUser } from '../_types';
import { patchAdminUser } from './patch-admin-user';

interface Props {
  user: Pick<AdminUser, 'id' | 'name' | 'email'> | null;
  onClose: () => void;
}

export function UserDisableDialog({ user, onClose }: Props) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (userId: string) =>
      patchAdminUser(
        userId,
        { action: 'deactivate' },
        'ユーザーを無効化できませんでした。時間をおいて再試行してください'
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      handleClose();
    },
  });

  const handleClose = () => {
    mutation.reset();
    onClose();
  };

  return (
    <Dialog
      open={!!user}
      onOpenChange={(open) => !open && !mutation.isPending && handleClose()}
    >
      <DialogContent
        onInteractOutside={(e) => mutation.isPending && e.preventDefault()}
        onEscapeKeyDown={(e) => mutation.isPending && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>ユーザー無効化</DialogTitle>
          <DialogDescription>
            <strong>{user?.name || user?.email}</strong>{' '}
            を無効化しますか？このユーザーはログインできなくなります。
          </DialogDescription>
        </DialogHeader>
        {mutation.error && (
          <div className="rounded-md border border-[var(--tt-color-negative-border)] bg-[var(--tt-color-negative-bg)] p-3 text-sm text-[var(--tt-color-negative)]">
            {mutation.error.message}
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={mutation.isPending}
          >
            キャンセル
          </Button>
          <Button
            variant="destructive"
            onClick={() => user && mutation.mutate(user.id)}
            disabled={mutation.isPending}
          >
            {mutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            無効化
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
