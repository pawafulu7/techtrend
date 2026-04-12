import { authClient } from '@/lib/auth/auth-client';

interface SessionUser {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
}

interface ExtendedSession {
  user: SessionUser;
}

export function useSession() {
  const { data: session, isPending } = authClient.useSession();

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
    isReady: !isPending,
    isAuthenticated: !!session,
    isLoading: isPending,
    isUnauthenticated: !isPending && !session,
    hasRole,
    canAccess,
  };
}