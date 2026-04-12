'use client';

import { MarkAllReadButton } from './mark-all-read-button';
import { useReadStatus } from '@/app/hooks/use-read-status';
import { authClient } from '@/lib/auth/auth-client';

export function MarkAllReadWrapper() {
  const { markAllAsRead, unreadCount } = useReadStatus();
  const { data: session } = authClient.useSession();

  if (!session?.user) {
    return null;
  }

  return (
    <MarkAllReadButton
      unreadCount={unreadCount}
      onMarkAllRead={markAllAsRead}
    />
  );
}
