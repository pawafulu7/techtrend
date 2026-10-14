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
import { ROLE_LABELS } from '../_types';
import type { AdminUser } from '../_types';
import { patchAdminUser } from './patch-admin-user';

interface Props {
  user: Pick<AdminUser, 'id' | 'name' | 'email' | 'role'> | null;
  onClose: () => void;
}

export function UserRoleDialog({ user, onClose }: Props) {
  const queryClient = useQueryClient();
  const newRole = user?.role === 'admin' ? 'user' : 'admin';

  const mutation = useMutation({
    mutationFn: (userId: string) =>
      patchAdminUser(
        userId,
        { action: 'changeRole', role: newRole },
        'ロールを変更できませんでした。時間をおいて再試行してください'
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
          <DialogTitle>ロール変更</DialogTitle>
          <DialogDescription>
            <strong>{user?.name || user?.email}</strong> のロールを{' '}
            <strong>{user?.role ? ROLE_LABELS[user.role] : ''}</strong> から{' '}
            <strong>{ROLE_LABELS[newRole]}</strong> に変更します。
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
            onClick={() => user && mutation.mutate(user.id)}
            disabled={mutation.isPending}
          >
            {mutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {ROLE_LABELS[newRole]}に変更
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
