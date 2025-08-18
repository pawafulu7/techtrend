'use client';

import Link from 'next/link';
import { Rss, TrendingUp, Menu, X, BarChart3, Bookmark, LineChart, Hash, Award, Database, Star, Filter, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { SITE_NAME } from '@/lib/constants';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { UserMenu } from '@/components/auth/UserMenu';
import { cn } from '@/lib/utils';
// import { NavDropdown } from '@/app/components/layout/nav-dropdown';

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  // ナビゲーション項目の定義
  const primaryNav = [
    { href: '/', label: 'ホーム', icon: Home },
    { href: '/popular', label: '人気', icon: TrendingUp },
    { href: '/sources', label: 'ソース', icon: Database },
    { href: '/trends', label: 'トレンド', icon: TrendingUp },
    { href: '/stats', label: '統計', icon: BarChart3 },
  ];

  const secondaryNav = [
    { href: '/reading-list', label: '読書リスト', icon: Bookmark },
    { href: '/favorites', label: 'お気に入り', icon: Star },
    { href: '/tags', label: 'タグ', icon: Hash },
    { href: '/analytics', label: '分析', icon: LineChart },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="w-full px-6">
        <div className="flex h-10 items-center justify-between">
          {/* Logo and Site Name */}
          <Link href="/" className="flex items-center space-x-2">
            <Rss className="h-5 w-5 text-primary" />
            <span className="text-lg font-bold">{SITE_NAME}</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-3">
            {/* 主要ナビゲーション */}
            {primaryNav.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              
              return (
                <Link 
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full transition-all duration-200",
                    "focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                    isActive 
                      ? "bg-primary text-primary-foreground shadow-sm" 
                      : "bg-secondary/30 hover:bg-secondary/60 hover:scale-105"
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
          <div className="hidden md:flex items-center space-x-4">
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
          <nav className="md:hidden py-4 border-t">
            <div className="flex flex-col space-y-2">
              {/* 主要ナビゲーション */}
              {primaryNav.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                
                return (
                  <Link 
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200",
                      "focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                      isActive 
                        ? "bg-primary text-primary-foreground shadow-sm" 
                        : "hover:bg-secondary/50"
                    )}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              
              <div className="h-px bg-border my-2" />
              
              {/* その他のナビゲーション */}
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 pt-2 pb-1">
                その他
              </div>
              {secondaryNav.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                
                return (
                  <Link 
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200",
                      "focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                      isActive 
                        ? "bg-primary text-primary-foreground shadow-sm" 
                        : "hover:bg-secondary/50"
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