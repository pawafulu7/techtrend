import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';

/**
 * 管理者権限チェック
 * 管理者でない場合はリダイレクト
 */
export async function requireAdmin() {
  const session = await auth();

  if (!session?.user) {
    // 未ログインの場合はログインページへ
    redirect('/auth/login');
  }

  if (session.user.role !== 'admin') {
    // 権限がない場合はホームへリダイレクト
    redirect('/');
  }

  return session;
}

/**
 * 管理者かどうかをチェック（boolean返却）
 */
export async function isAdmin(): Promise<boolean> {
  const session = await auth();
  return session?.user?.role === 'admin';
}

/**
 * ユーザーの権限レベルを取得
 */
export async function getUserRole(): Promise<string | null> {
  const session = await auth();
  return session?.user?.role || null;
}