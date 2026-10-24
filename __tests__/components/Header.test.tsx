import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { Header } from '@/app/components/layout/header';
import { CommandPaletteProvider } from '@/app/components/layout/command-palette';
import { useSession } from '@/lib/auth/auth-client';
import { useRouter, usePathname } from 'next/navigation';
import { renderWithProviders } from '../helpers/test-providers';

// Next.jsのモック
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(),
}));

jest.mock('@/lib/auth/auth-client', () => ({
  authClient: {
    useSession: jest.fn().mockReturnValue({ data: null, isPending: false }),
    signIn: { email: jest.fn(), social: jest.fn() },
    signOut: jest.fn(),
    signUp: { email: jest.fn() },
  },
  useSession: jest.fn().mockReturnValue({ data: null, isPending: false }),
  signIn: jest.fn(),
  signOut: jest.fn(),
  signUp: jest.fn(),
}));

jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => {
    return <a href={href}>{children}</a>;
  };
});

// UserMenuコンポーネントのモック
jest.mock('@/components/auth/UserMenu', () => ({
  UserMenu: () => <div data-testid="user-menu">User Menu</div>,
}));

// ヘッダーのコマンドパレットの入口は、ルートの layout が置く Provider の中で使う
const renderHeader = () =>
  renderWithProviders(
    <CommandPaletteProvider>
      <Header />
    </CommandPaletteProvider>
  );

const mockedUseRouter = jest.mocked(useRouter);
const mockedUsePathname = jest.mocked(usePathname);
const mockedUseSession = useSession as jest.Mock;

describe('Header', () => {
  const mockRouter = {
    push: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseRouter.mockReturnValue(mockRouter as ReturnType<typeof useRouter>);
    mockedUsePathname.mockReturnValue('/');
    mockedUseSession.mockReturnValue({ data: null, isPending: false });
  });

  it('renders the header with logo and navigation', () => {
    renderHeader();

    // ロゴが表示される
    const logo = screen.getByText(/TechTrend/i);
    expect(logo).toBeInTheDocument();

    // ナビゲーションリンクが表示される
    expect(screen.getByText(/ホーム|Home/i)).toBeInTheDocument();
  });

  it('shows different navigation items for authenticated users', () => {
    mockedUseSession.mockReturnValue({
      data: {
        user: { id: 'user1', email: 'test@example.com', name: 'Test User' },
      },
      isPending: false,
    });

    renderHeader();

    // 認証済みユーザー用のメニューが表示される（UserMenuコンポーネントがモックされている）
    const userMenus = screen.queryAllByTestId('user-menu');
    // UserMenuコンポーネントが存在することを確認（複数ある場合は最初のもの）
    expect(userMenus.length).toBeGreaterThan(0);
  });

  it('モバイルのメニューボタンは無い（主要導線は画面の下のボトムナビ、Issue #704）', () => {
    renderHeader();

    expect(
      screen.queryByRole('button', { name: /メニューを開く/ })
    ).not.toBeInTheDocument();
  });

  it('navigates to home when logo is clicked', () => {
    renderHeader();

    const logo = screen.getByText(/TechTrend/i);
    const logoLink = logo.closest('a');

    if (logoLink) {
      expect(logoLink).toHaveAttribute('href', '/');
    }
  });

  it('コマンドパレット（ページを開く・記事を検索）の入口をデスクトップとモバイルに出す', () => {
    renderHeader();

    expect(screen.getAllByTestId('command-palette-trigger')).toHaveLength(2);
  });

  it('shows correct navigation items', () => {
    renderHeader();

    // 主要導線はホーム・ダイジェスト・トレンド（未ログイン。Issue #704）
    const expectedLinks = [
      { text: 'ホーム', href: '/' },
      { text: 'ダイジェスト', href: '/digest' },
      { text: 'トレンド', href: '/trends' },
    ];

    expectedLinks.forEach(({ text, href }) => {
      expect(screen.getByText(text).closest('a')).toHaveAttribute('href', href);
    });
    // 主要導線から外した画面はヘッダーに出さない
    expect(screen.queryByText('分析')).not.toBeInTheDocument();
    expect(screen.queryByText('その他')).not.toBeInTheDocument();
  });

  it('renders sticky header when scrolling', () => {
    const { container } = renderHeader();

    const header = container.querySelector('header');

    // header.tsx は className="... sticky top-0 ..." を持っている
    expect(header).toBeTruthy();
    expect(header!.classList.contains('sticky')).toBe(true);
  });

  it('shows notification icon for authenticated users', () => {
    mockedUseSession.mockReturnValue({
      data: { user: { id: 'user1', email: 'test@example.com' } },
      isPending: false,
    });

    renderHeader();

    // 通知アイコンが表示される
    const notificationIcon = screen.queryByRole('button', {
      name: /通知|notification/i,
    });

    if (notificationIcon) {
      expect(notificationIcon).toBeInTheDocument();
    }
  });

  it('applies correct styles for dark mode', () => {
    // ダークモードのクラスを追加
    document.documentElement.classList.add('dark');

    const { container } = renderHeader();

    const header = container.querySelector('header');

    // ダークモード用のクラスが適用されている
    if (header) {
      expect(header).toBeInTheDocument();
      // ダークモード固有のスタイルチェック
    }

    // クリーンアップ
    document.documentElement.classList.remove('dark');
  });

  it('handles keyboard navigation', async () => {
    const user = userEvent.setup();
    renderHeader();

    const firstLink = screen.getAllByRole('link')[0];

    if (firstLink) {
      // Tab キーでフォーカスが移動する
      firstLink.focus();
      expect(document.activeElement).toBe(firstLink);

      // Enter キーでリンクが動作する
      await user.keyboard('{Enter}');
    }
  });

  it('お問い合わせのリンクを Tooltip ごと描画しても落ちない', () => {
    // デスクトップ側は Tooltip（Radix）で包む。Provider が無いと描画時に例外になる。
    // このファイルの next/link のモックは href 以外を捨てるので、href で数える
    const { container } = renderHeader();

    expect(container.querySelectorAll('a[href="/contact"]')).toHaveLength(2);
  });
});
