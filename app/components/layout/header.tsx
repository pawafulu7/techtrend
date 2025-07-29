'use client';

import Link from 'next/link';
import { Rss, TrendingUp, Menu, X, BarChart3, Bookmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { SITE_NAME } from '@/lib/constants';
import { ThemeToggle } from '@/components/ui/theme-toggle';

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-10 items-center justify-between">
          {/* Logo and Site Name */}
          <Link href="/" className="flex items-center space-x-2">
            <Rss className="h-5 w-5 text-primary" />
            <span className="text-lg font-bold">{SITE_NAME}</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            <Link 
              href="/" 
              className="text-sm font-medium hover:text-primary transition-colors"
            >
              ホーム
            </Link>
            <Link 
              href="/reading-list" 
              className="text-sm font-medium hover:text-primary transition-colors"
            >
              読書リスト
            </Link>
            <Link 
              href="/stats" 
              className="text-sm font-medium hover:text-primary transition-colors"
            >
              統計
            </Link>
            <Link 
              href="/trends" 
              className="text-sm font-medium hover:text-primary transition-colors"
            >
              トレンド
            </Link>
          </nav>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center space-x-4">
            <ThemeToggle />
          </div>

          {/* Mobile Actions */}
          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
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
            <div className="flex flex-col space-y-3">
              <Link 
                href="/" 
                className="text-sm font-medium hover:text-primary transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                ホーム
              </Link>
              <Link 
                href="/reading-list" 
                className="text-sm font-medium hover:text-primary transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Bookmark className="h-4 w-4 mr-2 inline" />
                読書リスト
              </Link>
              <Link 
                href="/stats" 
                className="text-sm font-medium hover:text-primary transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                <BarChart3 className="h-4 w-4 mr-2 inline" />
                統計
              </Link>
              <Link 
                href="/trends" 
                className="text-sm font-medium hover:text-primary transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                <TrendingUp className="h-4 w-4 mr-2 inline" />
                トレンド
              </Link>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}