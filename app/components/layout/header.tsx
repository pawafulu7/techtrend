'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SITE_NAME } from '@/lib/constants';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from '@/components/auth/UserMenu';
import { ContactLink } from '@/app/components/layout/contact-link';
import { ObservatoryMark } from '@/components/icons/observatory-mark';
import { navTabClass } from '@/components/ui-v2/nav-tab';
import { CommandPaletteTrigger } from './command-palette';
import {
  isAdminRoute,
  isPrimaryNavActive,
  primaryNavAriaCurrent,
  usePrimaryNav,
} from './primary-nav';

/**
 * サイトのヘッダー
 *
 * 主要導線（primary-nav.ts）は、デスクトップではここに文字のタブで出し、モバイルでは画面の下の
 * ボトムナビ（mobile-bottom-nav.tsx）に出す（Issue #704）。ほかの画面へは、コマンドパレット（⌘K）からも移れる
 */
export function Header() {
  const pathname = usePathname();
  const primaryNav = usePrimaryNav();

  if (isAdminRoute(pathname)) return null;

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-50 w-full border-b backdrop-blur">
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

          {/* Desktop Navigation。アイコンは付けず、文字のタブにする */}
          <nav
            aria-label="サイトのメニュー"
            className="mr-auto hidden h-12 items-stretch lg:flex"
            data-testid="desktop-nav"
          >
            {primaryNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                prefetch={item.prefetch}
                aria-current={primaryNavAriaCurrent(pathname, item)}
                data-testid={`nav-link-${item.label.toLowerCase()}`}
                className={navTabClass(isPrimaryNavActive(pathname, item))}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Desktop Actions */}
          <div className="hidden items-center gap-2 lg:flex">
            <CommandPaletteTrigger />
            <div className="flex items-center gap-1">
              <ContactLink desktop testId="header-contact-link" />
              <ThemeToggle />
            </div>
            <UserMenu />
          </div>

          {/* Mobile Actions。主要導線は画面の下のボトムナビにある */}
          <div className="flex items-center gap-1 lg:hidden">
            <CommandPaletteTrigger compact />
            <ContactLink testId="mobile-header-contact-link" />
            <ThemeToggle />
            <UserMenu compact />
          </div>
        </div>
      </div>
    </header>
  );
}
