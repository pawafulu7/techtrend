'use client';

import Link from 'next/link';
import {
  Rss,
  TrendingUp,
  Menu,
  X,
  BarChart3,
  LineChart,
  Hash,
  Database,
  Home,
  BookOpen,
  Newspaper,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { SITE_NAME } from '@/lib/constants';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from '@/components/auth/UserMenu';
import { cn } from '@/lib/utils';
// import { NavDropdown } from '@/app/components/layout/nav-dropdown';

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  // ナビゲーション項目の定義
  // prefetch: false は認証必須ページに設定（Server Component auth() redirect がprefetch時に走るのを防止）
  const primaryNav = [
    { href: '/', label: 'ホーム', icon: Home },
    { href: '/reader', label: 'リーダー', icon: BookOpen },
    {
      href: '/digest',
      label: 'ダイジェスト',
      icon: Newspaper,
      prefetch: false as const,
    },
    { href: '/popular', label: '人気', icon: TrendingUp },
    { href: '/sources', label: 'ソース', icon: Database },
    { href: '/trends', label: 'トレンド', icon: BarChart3 },
    { href: '/stats', label: '統計', icon: LineChart },
  ];

  const secondaryNav = [
    { href: '/history', label: '閲覧履歴', icon: LineChart },
    { href: '/tags', label: 'タグ', icon: Hash },
    { href: '/analytics', label: '分析', icon: LineChart },
  ];

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 w-full border-b backdrop-blur">
      <div className="w-full px-6">
        <div className="flex h-10 items-center justify-between">
          {/* Logo and Site Name */}
          <Link
            href="/"
            className="flex items-center space-x-2"
            data-testid="header-logo"
          >
            <Rss className="text-primary h-5 w-5" />
            <span className="text-lg font-bold">{SITE_NAME}</span>
          </Link>

          {/* Desktop Navigation */}
          <nav
            className="hidden items-center space-x-3 md:flex"
            data-testid="desktop-nav"
          >
            {/* 主要ナビゲーション */}
            {primaryNav.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={'prefetch' in item ? item.prefetch : undefined}
                  aria-current={isActive ? 'page' : undefined}
                  data-testid={`nav-link-${item.label.toLowerCase()}`}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-200',
                    'focus-visible:ring-primary focus-visible:ring-2 focus-visible:outline-none',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-secondary/30 hover:bg-secondary/60 hover:scale-105'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}

            {/* ドロップダウンメニュー */}
            {/* <NavDropdown items={secondaryNav} /> */}
          </nav>

          {/* Desktop Actions */}
          <div className="hidden items-center space-x-4 md:flex">
            <ThemeToggle />
            <UserMenu />
          </div>

          {/* Mobile Actions */}
          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <UserMenu />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
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
          <nav className="border-t py-4 md:hidden" data-testid="mobile-nav">
            <div className="flex flex-col space-y-2">
              {/* 主要ナビゲーション */}
              {primaryNav.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={'prefetch' in item ? item.prefetch : undefined}
                    aria-current={isActive ? 'page' : undefined}
                    data-testid={`mobile-nav-link-${item.label.toLowerCase()}`}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
                      'focus-visible:ring-primary focus-visible:ring-2 focus-visible:outline-none',
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'hover:bg-secondary/50'
                    )}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}

              <div className="bg-border my-2 h-px" />

              {/* その他のナビゲーション */}
              <div className="text-muted-foreground px-3 pt-2 pb-1 text-xs font-semibold tracking-wider uppercase">
                その他
              </div>
              {secondaryNav.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    data-testid={`mobile-secondary-nav-link-${item.label.toLowerCase()}`}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
                      'focus-visible:ring-primary focus-visible:ring-2 focus-visible:outline-none',
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'hover:bg-secondary/50'
                    )}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
