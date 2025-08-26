'use client';

import { UnreadFilter } from './unread-filter';
import { useSession } from 'next-auth/react';

export function UnreadFilterWithData() {
  const { data: session } = useSession();
  
  // 認証チェックを追加
  if (!session?.user) {
    return null;
  }
  
  return <UnreadFilter />;
}