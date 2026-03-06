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
  user: Pick<AdminUser, 'id' | 'name' | 'email' | 'role'> | null;
  onClose: () => void;
}

const roleLabel = { admin: '管理者', user: '一般ユーザー' } as const;

export function UserRoleDialog({ user, onClose }: Props) {
  const queryClient = useQueryClient();
  const newRole = user?.role === 'admin' ? 'user' : 'admin';

  const mutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'changeRole', role: newRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to change role');
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
          <DialogTitle>ロール変更</DialogTitle>
          <DialogDescription>
            <strong>{user?.name || user?.email}</strong> のロールを{' '}
            <strong>{user?.role ? roleLabel[user.role] : ''}</strong> から{' '}
            <strong>{roleLabel[newRole]}</strong> に変更します。
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
            onClick={() => mutation.mutate(user!.id)}
            disabled={mutation.isPending}
          >
            {mutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {roleLabel[newRole]}に変更
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
