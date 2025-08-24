'use client';

import { MarkAllReadButton } from './mark-all-read-button';
import { useReadStatus } from '@/app/hooks/use-read-status';
import { useSession } from 'next-auth/react';

export function MarkAllReadWrapper() {
  const { markAllAsRead, unreadCount } = useReadStatus();
  const { data: session } = useSession();
  
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