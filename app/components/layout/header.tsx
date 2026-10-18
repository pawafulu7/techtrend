'use client';

import Link from 'next/link';
import {
  TrendingUp,
  Menu,
  X,
  BarChart3,
  LineChart,
  Hash,
  Home,
  BookOpen,
  Newspaper,
  FileText,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui-v2/button-v2';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { SITE_NAME } from '@/lib/constants';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from '@/components/auth/UserMenu';
import { cn } from '@/lib/utils';
import { NavDropdown } from '@/app/components/layout/nav-dropdown';
import { ContactLink } from '@/app/components/layout/contact-link';
import { useIsHydrated } from '@/lib/hooks/use-is-hydrated';
import { authClient } from '@/lib/auth/auth-client';
import { features } from '@/config/features';
import { ObservatoryMark } from '@/components/icons/observatory-mark';
import {
  isNavActive,
  navAriaCurrent,
  navTabClass,
} from '@/components/ui-v2/nav-tab';

const MOBILE_NAV_ID = 'mobile-nav-panel';

export function Header() {
  const pathname = usePathname();
  // モバイルメニューは開いたときのパスを覚え、そのパスにいる間だけ開いている。
  // ロゴ・お問い合わせ・ユーザーメニューからの移動や、ブラウザの戻るでも、別のページでは閉じる
  const [menuOpenedAt, setMenuOpenedAt] = useState<string | null>(null);
  // 別のページに移ったら覚えたパスも消す（残すと、戻るで元のページに戻ったときにまた開く）。
  // effect ではなく描画中に合わせる（https://react.dev/learn/you-might-not-need-an-effect）
  if (menuOpenedAt !== null && menuOpenedAt !== pathname) {
    setMenuOpenedAt(null);
  }
  const mobileMenuOpen = menuOpenedAt === pathname;
  const closeMobileMenu = () => setMenuOpenedAt(null);
  const { data: session, isPending } = authClient.useSession();
  // サーバー描画ではセッションが判定中。hydration 中もそれに合わせる（issue #714）
  const isHydrated = useIsHydrated();
  const isSessionReady = isHydrated && !isPending;
  const headerRef = useRef<HTMLElement>(null);
  const menuToggleRef = useRef<HTMLButtonElement>(null);

  // モバイルメニューは Esc とヘッダーの外のクリックで閉じる
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // ユーザーメニューなど、先に Esc を使った部品があればそちらだけを閉じる（Radix は preventDefault する）。
      // 変換中の Esc は変換の取り消しなので閉じない
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        event.isComposing
      ) {
        return;
      }
      // パネルの中のフォーカスは閉じると行き場を失うので、開いたボタンへ戻す。本文にあるフォーカスは動かさない
      const focusInHeader = headerRef.current?.contains(document.activeElement);
      setMenuOpenedAt(null);
      if (focusInHeader) menuToggleRef.current?.focus();
    };
    // pointerdown で閉じると、パネルの分だけ本文が上にずれてから指が離れ、タップが別の要素に届く。
    // click は宛先が決まってから届くので、capture で受けて閉じ、押したものにはそのまま click を渡す
    const onClick = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        headerRef.current?.contains(event.target)
      ) {
        return;
      }
      setMenuOpenedAt(null);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('click', onClick, true);
    };
  }, [mobileMenuOpen]);

  // ナビゲーション項目の定義
  // prefetch: false は認証必須ページに設定（Server Component auth() redirect がprefetch時に走るのを防止）
  const primaryNavBase = [
    { href: '/', label: 'ホーム', icon: Home },
    { href: '/reader', label: 'リーダー', icon: BookOpen },
    {
      href: '/digest',
      label: 'ダイジェスト',
      icon: Newspaper,
      prefetch: false as const,
    },
    { href: '/popular', label: '人気', icon: TrendingUp },
  ];

  // Issue #585: AI検索はフラグ有効 + 認証済みユーザーのみ表示（isPending中はチラつき防止のため非表示）
  const showAiSearch = features.aiSearch && isSessionReady && !!session?.user;
  const aiSearchNavItem = {
    href: '/search/agent',
    label: 'AI検索',
    icon: Sparkles,
    prefetch: false as const,
  };

  const primaryNav = [
    ...primaryNavBase,
    ...(showAiSearch ? [aiSearchNavItem] : []),
    { href: '/trends', label: 'トレンド', icon: BarChart3 },
  ];

  const showSignupLink = isSessionReady && !session;

  const secondaryNav = [
    { href: '/history', label: '閲覧履歴', icon: LineChart },
    { href: '/tags', label: 'タグ', icon: Hash },
    { href: '/analytics', label: '分析', icon: LineChart },
    { href: '/changelog', label: 'AIエージェント更新情報', icon: FileText },
  ];

  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
  if (isAdminRoute) return null;

  return (
    <header
      ref={headerRef}
      className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-50 w-full border-b backdrop-blur"
    >
      <div className="w-full px-4 lg:px-6">
        {/* 高さは全幅で 48px（押せる高さ 44px を取るため）。デスクトップのナビのタブはこの高さいっぱいに伸ばし、
            選ばれている項目の下線をヘッダーの下の線に重ねる */}
        <div className="flex h-12 items-center justify-between gap-4">
          {/* Logo and Site Name */}
          <Link
            href="/"
            className="flex min-w-0 items-center space-x-2"
            data-testid="header-logo"
          >
            <ObservatoryMark className="h-[22px] w-[22px] shrink-0" />
            {/* お問い合わせのアイコンの分だけ入りきらない幅（〜399px、1024〜1279px）では、
                切れた名前を出さずにロゴのアイコンだけにする（読み上げ用の名前は残す） */}
            <span className="font-heading truncate text-lg font-bold tracking-[-0.01em] [font-stretch:88%] max-[399px]:sr-only lg:max-xl:sr-only">
              {SITE_NAME}
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav
            aria-label="サイトのメニュー"
            className="mr-auto hidden h-12 items-stretch lg:flex"
            data-testid="desktop-nav"
          >
            {/* 主要ナビゲーション。アイコンは付けず、文字のタブにする */}
            {primaryNav.map((item) => {
              const isActive = isNavActive(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={'prefetch' in item ? item.prefetch : undefined}
                  aria-current={navAriaCurrent(pathname, item.href)}
                  data-testid={`nav-link-${item.label.toLowerCase()}`}
                  className={navTabClass(isActive)}
                >
                  {item.label}
                </Link>
              );
            })}

            {/* ドロップダウンメニュー */}
            <NavDropdown items={secondaryNav} />
          </nav>

          {/* Desktop Actions */}
          <div className="hidden items-center gap-2 lg:flex">
            <div className="flex items-center gap-1">
              <ContactLink desktop testId="header-contact-link" />
              <ThemeToggle />
            </div>
            <UserMenu />
          </div>

          {/* Mobile Actions */}
          <div className="flex items-center gap-2 lg:hidden">
            <ContactLink testId="mobile-header-contact-link" />
            <ThemeToggle />
            <UserMenu compact />
            <Button
              ref={menuToggleRef}
              variant="ghost"
              size="sm"
              className="h-11 w-11"
              onClick={() => setMenuOpenedAt(mobileMenuOpen ? null : pathname)}
              aria-label={
                mobileMenuOpen ? 'メニューを閉じる' : 'メニューを開く'
              }
              aria-expanded={mobileMenuOpen}
              aria-controls={MOBILE_NAV_ID}
              data-testid="mobile-menu-toggle"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav
            id={MOBILE_NAV_ID}
            aria-label="サイトのメニュー"
            className="border-t py-4 lg:hidden"
            data-testid="mobile-nav"
          >
            <div className="flex flex-col space-y-2">
              {/* 主要ナビゲーション */}
              {primaryNav.map((item) => {
                const Icon = item.icon;
                const isActive = isNavActive(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={'prefetch' in item ? item.prefetch : undefined}
                    aria-current={navAriaCurrent(pathname, item.href)}
                    data-testid={`mobile-nav-link-${item.label.toLowerCase()}`}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150',
                      'focus-visible:ring-primary focus-visible:ring-2 focus-visible:outline-none',
                      isActive
                        ? 'bg-(--tt-color-primary-bg) font-semibold text-(--tt-color-primary)'
                        : 'text-(--tt-color-text) hover:bg-(--tt-color-surface-hover)'
                    )}
                    onClick={closeMobileMenu}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}

              <div className="bg-border my-2 h-px" />

              {/* その他のナビゲーション */}
              <div className="text-muted-foreground px-3 pt-2 pb-1 text-xs font-semibold">
                その他
              </div>
              {secondaryNav.map((item) => {
                const Icon = item.icon;
                const isActive = isNavActive(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={navAriaCurrent(pathname, item.href)}
                    data-testid={`mobile-secondary-nav-link-${item.label.toLowerCase()}`}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150',
                      'focus-visible:ring-primary focus-visible:ring-2 focus-visible:outline-none',
                      isActive
                        ? 'bg-(--tt-color-primary-bg) font-semibold text-(--tt-color-primary)'
                        : 'text-(--tt-color-text) hover:bg-(--tt-color-surface-hover)'
                    )}
                    onClick={closeMobileMenu}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}

              {showSignupLink && (
                <>
                  <div className="bg-border my-2 h-px" />
                  <Link
                    href="/auth/signup"
                    data-testid="mobile-nav-link-signup"
                    className={cn(
                      'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150',
                      'focus-visible:ring-primary focus-visible:ring-2 focus-visible:outline-none',
                      'text-(--tt-color-text) hover:bg-(--tt-color-surface-hover)'
                    )}
                    onClick={closeMobileMenu}
                  >
                    <UserPlus className="h-4 w-4" />
                    <span>新規登録</span>
                  </Link>
                </>
              )}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
