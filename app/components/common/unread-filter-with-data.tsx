'use client';

import { UnreadFilter } from './unread-filter';
import { useReadStatus } from '@/app/hooks/use-read-status';

export function UnreadFilterWithData() {
  const { unreadCount } = useReadStatus();
  
  return <UnreadFilter unreadCount={unreadCount} />;
}