import type { LucideIcon } from 'lucide-react';
import { BarChart3, Home, Newspaper, Sparkles } from 'lucide-react';
import { authClient } from '@/lib/auth/auth-client';
import { useIsHydrated } from '@/lib/hooks/use-is-hydrated';
import { features } from '@/config/features';
import { isNavActive, navAriaCurrent } from '@/components/ui-v2/nav-tab';

export interface PrimaryNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** 認証が要るページ。Server Component の redirect が prefetch で走らないよう prefetch しない */
  prefetch?: false;
  /** この項目の下に移した画面（そこを開いているときも、この項目を選ばれている表示にする） */
  activeOn?: readonly string[];
}

/**
 * 主要導線（Issue #704）。デスクトップのヘッダーとモバイルのボトムナビが同じ項目を出す。
 * 残りの画面は、リーダーはホームの表示切り替え、人気・タグ・AIエージェント更新情報はトレンドのサブナビ、
 * 閲覧履歴はユーザーメニューから開く（どれもコマンドパレットからも開ける）
 */
const HOME: PrimaryNavItem = {
  href: '/',
  label: 'ホーム',
  icon: Home,
  activeOn: ['/reader'],
};
const DIGEST: PrimaryNavItem = {
  href: '/digest',
  label: 'ダイジェスト',
  icon: Newspaper,
  prefetch: false,
};
const TRENDS: PrimaryNavItem = {
  href: '/trends',
  label: 'トレンド',
  icon: BarChart3,
  activeOn: ['/popular', '/tags', '/changelog'],
};
const AI_SEARCH: PrimaryNavItem = {
  href: '/search/agent',
  label: 'AI検索',
  icon: Sparkles,
  prefetch: false,
};

export function isAdminRoute(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

/** AI 検索を出すか。フラグが有効で、ログイン中のときだけ（判定中はちらつかないよう出さない。Issue #585） */
export function useShowAiSearch(): boolean {
  const { data: session, isPending } = authClient.useSession();
  // サーバー描画ではセッションが判定中。hydration 中もそれに合わせる（issue #714）
  const isHydrated = useIsHydrated();
  return features.aiSearch && isHydrated && !isPending && !!session?.user;
}

export function usePrimaryNav(): PrimaryNavItem[] {
  const showAiSearch = useShowAiSearch();
  return showAiSearch
    ? [HOME, DIGEST, TRENDS, AI_SEARCH]
    : [HOME, DIGEST, TRENDS];
}

export function isPrimaryNavActive(
  pathname: string,
  item: PrimaryNavItem
): boolean {
  return [item.href, ...(item.activeOn ?? [])].some((href) =>
    isNavActive(pathname, href)
  );
}

/** 項目のページそのものは 'page'、その下や activeOn の画面を開いているときは 'true' */
export function primaryNavAriaCurrent(
  pathname: string,
  item: PrimaryNavItem
): 'page' | 'true' | undefined {
  const own = navAriaCurrent(pathname, item.href);
  if (own) return own;
  return item.activeOn?.some((href) => isNavActive(pathname, href))
    ? 'true'
    : undefined;
}
