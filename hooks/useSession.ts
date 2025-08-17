import { useSession as useNextAuthSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

interface SessionUser {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
}

interface ExtendedSession {
  user: SessionUser;
  expires: string;
}

export function useSession() {
  const { data: session, status, update } = useNextAuthSession();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (status !== 'loading') {
      setIsReady(true);
    }
  }, [status]);

  const refreshSession = async () => {
    await update();
  };

  const hasRole = (role: string): boolean => {
    // 将来的にロールベースのアクセス制御を実装
    return false;
  };

  const canAccess = (resource: string): boolean => {
    // リソースベースのアクセス制御チェック
    if (!session) return false;
    
    // 基本的な認証チェック
    return true;
  };

  return {
    session: session as ExtendedSession | null,
    user: session?.user as SessionUser | undefined,
    status,
    isReady,
    isAuthenticated: status === 'authenticated',
    isLoading: status === 'loading',
    isUnauthenticated: status === 'unauthenticated',
    refreshSession,
    hasRole,
    canAccess,
  };
}