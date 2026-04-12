import { authClient } from '@/lib/auth/auth-client';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

export function useAuth() {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();

  const login = useCallback(
    async (email: string, password: string) => {
      const { error } = await authClient.signIn.email({ email, password });

      if (!error) {
        router.refresh();
        return { success: true };
      }

      return {
        success: false,
        error: error.message || 'ログインに失敗しました',
      };
    },
    [router]
  );

  const logout = useCallback(async () => {
    await authClient.signOut();
    router.push('/');
    router.refresh();
  }, [router]);

  const loginWithProvider = useCallback(
    async (provider: 'google' | 'github', callbackUrl?: string) => {
      await authClient.signIn.social({ provider, callbackURL: callbackUrl || '/' });
    },
    []
  );

  return {
    user: session?.user,
    isAuthenticated: !!session,
    isLoading: isPending,
    login,
    logout,
    loginWithProvider,
  };
}