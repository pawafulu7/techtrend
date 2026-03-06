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
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import type { AdminUser } from '../_types';

interface Props {
  user: Pick<AdminUser, 'id' | 'name' | 'email'> | null;
  onClose: () => void;
}

export function UserDisableDialog({ user, onClose }: Props) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deactivate' }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to deactivate user');
      }
      return res.json();
    },
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
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
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
            onClick={() => mutation.mutate(user!.id)}
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
