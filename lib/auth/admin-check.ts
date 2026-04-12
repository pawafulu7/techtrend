import { headers } from 'next/headers';
import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { getUserAuthData } from '@/lib/auth/user-auth-cache';

/**
 * Server-side admin check for page protection
 *
 * Uses DB-backed role verification via getUserAuthData() for immediate
 * role demotion enforcement (not JWT-cached role).
 * Redirects non-admin users.
 */
export async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    redirect('/auth/login');
  }

  const authData = await getUserAuthData(session.user.id);

  if (!authData || authData.deletedAt || authData.role !== 'admin') {
    redirect('/');
  }

  return session;
}

/**
 * Check if current user is admin (boolean)
 * Uses DB-backed verification.
 */
export async function isAdmin(): Promise<boolean> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return false;

  const authData = await getUserAuthData(session.user.id);
  return !!authData && !authData.deletedAt && authData.role === 'admin';
}

/**
 * Get user role from DB cache
 */
export async function getUserRole(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return null;

  const authData = await getUserAuthData(session.user.id);
  return authData?.role || null;
}
