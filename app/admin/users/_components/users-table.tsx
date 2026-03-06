'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useState } from 'react';
import { UserRoleDialog } from './user-role-dialog';
import { UserDisableDialog } from './user-disable-dialog';
import { ROLE_LABELS } from '../_types';
import type { AdminUser } from '../_types';

async function fetchUsers(): Promise<AdminUser[]> {
  const res = await fetch('/api/admin/users');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to fetch users');
  }
  const data = await res.json();
  return data.users;
}

export function UsersTable() {
  const {
    data: users,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: fetchUsers,
  });

  const [roleDialogUser, setRoleDialogUser] = useState<AdminUser | null>(null);
  const [disableDialogUser, setDisableDialogUser] = useState<AdminUser | null>(
    null
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-800">
        ユーザーの読み込みに失敗しました。再試行してください。
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ユーザー</TableHead>
              <TableHead>ロール</TableHead>
              <TableHead>ステータス</TableHead>
              <TableHead>登録日</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users?.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-muted-foreground py-8 text-center"
                >
                  ユーザーが見つかりませんでした。
                </TableCell>
              </TableRow>
            )}
            {users?.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage
                        src={user.image || ''}
                        alt={user.name || ''}
                      />
                      <AvatarFallback>
                        {(user.name || user.email).charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">
                        {user.name || '名前なし'}
                      </div>
                      <div className="text-muted-foreground text-sm">
                        {user.email}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={user.role === 'admin' ? 'default' : 'secondary'}
                  >
                    {ROLE_LABELS[user.role]}
                  </Badge>
                </TableCell>
                <TableCell>
                  {user.deletedAt ? (
                    <Badge variant="destructive">無効</Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-green-300 text-green-700"
                    >
                      有効
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {new Date(user.createdAt).toLocaleDateString('ja-JP')}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRoleDialogUser(user)}
                      disabled={!!user.deletedAt}
                    >
                      ロール変更
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDisableDialogUser(user)}
                      disabled={!!user.deletedAt}
                      className="text-red-600 hover:text-red-700"
                    >
                      無効化
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <UserRoleDialog
        user={roleDialogUser}
        onClose={() => setRoleDialogUser(null)}
      />
      <UserDisableDialog
        user={disableDialogUser}
        onClose={() => setDisableDialogUser(null)}
      />
    </>
  );
}
