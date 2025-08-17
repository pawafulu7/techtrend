import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

export function useAuth() {
  const { data: session, status, update } = useSession();
  const router = useRouter();

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.ok) {
        router.refresh();
        return { success: true };
      }

      return {
        success: false,
        error: result?.error || 'ログインに失敗しました',
      };
    },
    [router]
  );

  const logout = useCallback(async () => {
    await signOut({ redirect: false });
    router.push('/');
    router.refresh();
  }, [router]);

  const loginWithProvider = useCallback(
    async (provider: 'google' | 'github', callbackUrl?: string) => {
      await signIn(provider, { callbackUrl: callbackUrl || '/' });
    },
    []
  );

  return {
    user: session?.user,
    isAuthenticated: status === 'authenticated',
    isLoading: status === 'loading',
    login,
    logout,
    loginWithProvider,
    updateSession: update,
  };
}