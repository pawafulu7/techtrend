/**
 * モバイルのボトムナビ（Issue #704）
 *
 * 主要導線を画面の下に常に出し、1 回のタップで移れるようにする。今いる項目は藍の線と aria-current で示す。
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { usePathname } from 'next/navigation';
import { authClient } from '@/lib/auth/auth-client';
import { MobileBottomNav } from '@/app/components/layout/mobile-bottom-nav';

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

jest.mock('@/lib/auth/auth-client', () => ({
  authClient: {
    useSession: jest.fn().mockReturnValue({ data: null, isPending: false }),
  },
}));

jest.mock('@/config/features', () => ({
  features: { aiSearch: true },
}));

const mockUseSession = authClient.useSession as jest.Mock;

function links() {
  return within(screen.getByTestId('mobile-bottom-nav')).getAllByRole('link');
}

describe('MobileBottomNav', () => {
  beforeEach(() => {
    (usePathname as jest.Mock).mockReturnValue('/');
    mockUseSession.mockReturnValue({ data: null, isPending: false });
  });

  it('未ログインでは、ホーム・ダイジェスト・トレンドを3列で出す', () => {
    render(<MobileBottomNav />);

    expect(
      links().map((link) => [link.textContent, link.getAttribute('href')])
    ).toEqual([
      ['ホーム', '/'],
      ['ダイジェスト', '/digest'],
      ['トレンド', '/trends'],
    ]);
    expect(screen.getByRole('list')).toHaveClass('grid-cols-3');
  });

  it('ログイン中は AI 検索を足して4列にする', () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'u1' } },
      isPending: false,
    });
    render(<MobileBottomNav />);

    expect(links().map((link) => link.textContent)).toEqual([
      'ホーム',
      'ダイジェスト',
      'トレンド',
      'AI検索',
    ]);
    expect(screen.getByRole('list')).toHaveClass('grid-cols-4');
  });

  it('セッションの判定中は AI 検索を出さない（ちらつかせない）', () => {
    mockUseSession.mockReturnValue({ data: null, isPending: true });
    render(<MobileBottomNav />);

    expect(links()).toHaveLength(3);
  });

  it('lg 以上では出さない（デスクトップはヘッダーのタブ）', () => {
    render(<MobileBottomNav />);

    expect(screen.getByTestId('mobile-bottom-nav')).toHaveClass('lg:hidden');
  });

  it.each([
    ['/', 'ホーム', 'page'],
    ['/reader', 'ホーム', 'true'],
    ['/trends', 'トレンド', 'page'],
    ['/trends/daily', 'トレンド', 'true'],
    ['/popular', 'トレンド', 'true'],
    ['/tags', 'トレンド', 'true'],
  ])('%s では「%s」を aria-current=%s にし、藍の線を引く', (pathname, label, current) => {
    (usePathname as jest.Mock).mockReturnValue(pathname);
    render(<MobileBottomNav />);

    const active = screen.getByTestId(`bottom-nav-link-${label}`);
    expect(active).toHaveAttribute('aria-current', current);
    expect(active).toHaveClass('before:bg-(--tt-color-primary)');
    links()
      .filter((link) => link !== active)
      .forEach((link) => {
        expect(link).not.toHaveAttribute('aria-current');
        expect(link).toHaveClass('before:bg-transparent');
      });
  });

  it('管理画面では出さない', () => {
    (usePathname as jest.Mock).mockReturnValue('/admin/stats');
    render(<MobileBottomNav />);

    expect(screen.queryByTestId('mobile-bottom-nav')).not.toBeInTheDocument();
  });
});
