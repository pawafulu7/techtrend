'use client';

import { UnreadFilter } from './unread-filter';
import { authClient } from '@/lib/auth/auth-client';

export function UnreadFilterWithData() {
  const { data: session } = authClient.useSession();

  // 認証チェックを追加
  if (!session?.user) {
    return null;
  }

  return <UnreadFilter />;
}
