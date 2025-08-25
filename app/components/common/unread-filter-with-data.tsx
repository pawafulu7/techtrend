'use client';

import { UnreadFilter } from './unread-filter';
import { useReadStatus } from '@/app/hooks/use-read-status';
import { useSession } from 'next-auth/react';

export function UnreadFilterWithData() {
  const { unreadCount } = useReadStatus();
  const { data: session } = useSession();
  
  // 認証チェックを追加
  if (!session?.user) {
    return null;
  }
  
  return <UnreadFilter unreadCount={unreadCount} />;
}