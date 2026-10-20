import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { Header } from '@/app/components/layout/header';
import { usePathname } from 'next/navigation';

// Next.jsのモック
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

// 定数のモック
jest.mock('@/lib/constants', () => ({
  SITE_NAME: 'TechTrend',
}));

// better-auth の client は ESM のため、Jest では実体を読み込ませずモックする
// （Issue #585 で Header が AI 検索リンクの表示判定に useSession を使うようになった）
jest.mock('@/lib/auth/auth-client', () => ({
  authClient: {
    useSession: jest.fn().mockReturnValue({ data: null, isPending: false }),
    signIn: { email: jest.fn(), social: jest.fn() },
    signOut: jest.fn(),
    signUp: { email: jest.fn() },
  },
}));

// コンポーネントのモック
jest.mock('@/components/theme-toggle', () => ({
  ThemeToggle: () => <button data-testid="theme-toggle">Theme Toggle</button>,
}));

jest.mock('@/components/auth/UserMenu', () => ({
  UserMenu: () => <button data-testid="user-menu">User Menu</button>,
}));

jest.mock('@/app/components/layout/nav-dropdown', () => ({
  NavDropdown: ({ items }: any) => (
    <div data-testid="nav-dropdown">
      <span>その他</span>
      {items.map((item: any) => (
        <a
          key={item.href}
          href={item.href}
          data-testid={`nav-dropdown-item-${item.href.replace(/\//g, '-').replace(/^-/, '')}`}
        >
          {item.label}
        </a>
      ))}
    </div>
  ),
}));

describe('Header', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (usePathname as jest.Mock).mockReturnValue('/');
  });

  describe('基本的なレンダリング', () => {
    it('ヘッダーが正しく表示される', () => {
      render(<Header />);

      // ロゴとサイト名
      const logo = screen.getByTestId('header-logo');
      expect(logo).toBeInTheDocument();
      expect(screen.getByText('TechTrend')).toBeInTheDocument();

      // テーマトグルとユーザーメニュー
      expect(screen.getAllByTestId('theme-toggle')).toHaveLength(2); // Desktop + Mobile
      expect(screen.getAllByTestId('user-menu')).toHaveLength(2); // Desktop + Mobile
    });

    it('デスクトップナビゲーションが表示される', () => {
      render(<Header />);

      const desktopNav = screen.getByTestId('desktop-nav');
      expect(desktopNav).toBeInTheDocument();

      // 主要ナビゲーション項目（/sources・/stats は管理者限定のため除外）
      expect(screen.getByTestId('nav-link-ホーム')).toBeInTheDocument();
      expect(screen.getByTestId('nav-link-人気')).toBeInTheDocument();
      expect(screen.getByTestId('nav-link-トレンド')).toBeInTheDocument();
    });

    it('モバイルメニューボタンが表示される', () => {
      render(<Header />);

      const mobileMenuToggle = screen.getByTestId('mobile-menu-toggle');
      expect(mobileMenuToggle).toBeInTheDocument();
    });
  });

  describe('アクティブ状態の表示', () => {
    it('現在のページがアクティブ状態で表示される', () => {
      (usePathname as jest.Mock).mockReturnValue('/popular');

      render(<Header />);

      const popularLink = screen.getByTestId('nav-link-人気');
      expect(popularLink).toHaveAttribute('aria-current', 'page');
      // 選ばれている項目は文字を濃くし、下に藍の線を引く
      expect(popularLink).toHaveClass(
        'font-semibold text-(--tt-color-text) after:bg-(--tt-color-primary)'
      );
    });

    it('非アクティブなリンクは通常のスタイルで表示される', () => {
      (usePathname as jest.Mock).mockReturnValue('/');

      render(<Header />);

      const popularLink = screen.getByTestId('nav-link-人気');
      expect(popularLink).not.toHaveAttribute('aria-current');
      expect(popularLink).toHaveClass(
        'text-(--tt-color-text-muted) after:bg-transparent'
      );
    });

    it('下の階層のページでも、その項目を選ばれている表示にする', () => {
      (usePathname as jest.Mock).mockReturnValue('/trends/daily');

      render(<Header />);

      // 今のページはトレンドのサブナビの「デイリー」なので、親の「トレンド」は 'page' ではなく 'true'
      const trendsLink = screen.getByTestId('nav-link-トレンド');
      expect(trendsLink).toHaveAttribute('aria-current', 'true');
      expect(trendsLink).toHaveClass('after:bg-(--tt-color-primary)');
      // ホーム（/）は完全一致だけ
      expect(screen.getByTestId('nav-link-ホーム')).not.toHaveAttribute(
        'aria-current'
      );
    });
  });

  describe('メニューアイコンの切り替え', () => {
    it('開いている時はXアイコンが表示される', async () => {
      const user = userEvent.setup();
      render(<Header />);

      const toggleButton = screen.getByTestId('mobile-menu-toggle');

      // 初期状態はMenuアイコン
      const menuIcon = toggleButton.querySelector('.lucide-menu');
      expect(menuIcon).toBeInTheDocument();

      // クリック後はXアイコン
      await user.click(toggleButton);
      const xIcon = toggleButton.querySelector('.lucide-x');
      expect(xIcon).toBeInTheDocument();
    });
  });

  describe('リンクのhref属性', () => {
    it('正しいhref属性が設定されている', () => {
      render(<Header />);

      // /sources・/stats は管理者限定のため primaryNav から除外済み
      const links = [
        { testId: 'nav-link-ホーム', href: '/' },
        { testId: 'nav-link-人気', href: '/popular' },
        { testId: 'nav-link-トレンド', href: '/trends' },
      ];

      links.forEach((link) => {
        const element = screen.getByTestId(link.testId);
        expect(element).toHaveAttribute('href', link.href);
      });
    });
  });

  // ヘッダーのデスクトップ切替は lg。ツールバー（検索・タグ等）が lg 基準のため、
  // md にすると 768〜1023px でナビだけデスクトップ表示になりヘッダーが溢れる
  describe('レスポンシブ表示', () => {
    it('デスクトップナビはlg以上で表示される', () => {
      render(<Header />);

      const desktopNav = screen.getByTestId('desktop-nav');
      expect(desktopNav).toHaveClass('hidden lg:flex');
    });

    it('モバイルメニューボタンはlg未満で表示される', () => {
      render(<Header />);

      const mobileMenuToggle =
        screen.getByTestId('mobile-menu-toggle').parentElement;
      expect(mobileMenuToggle).toHaveClass('lg:hidden');
    });

    it('モバイルナビはlg未満でのみ表示される', async () => {
      const user = userEvent.setup();
      render(<Header />);

      const toggleButton = screen.getByTestId('mobile-menu-toggle');
      await user.click(toggleButton);

      const mobileNav = screen.getByTestId('mobile-nav');
      expect(mobileNav).toHaveClass('lg:hidden');
    });
  });

  describe('スティッキーヘッダー', () => {
    it('スティッキー位置が設定されている', () => {
      const { container } = render(<Header />);

      const header = container.querySelector('header');
      expect(header).toHaveClass('sticky top-0 z-50');
    });

    it('背景ぼかし効果が適用されている', () => {
      const { container } = render(<Header />);

      const header = container.querySelector('header');
      expect(header).toHaveClass('backdrop-blur');
    });
  });

  describe('アクセシビリティ', () => {
    it('aria-current属性が正しく設定される', () => {
      // /stats は管理者限定のため、代わりに /trends を使用
      (usePathname as jest.Mock).mockReturnValue('/trends');

      render(<Header />);

      const trendsLink = screen.getByTestId('nav-link-トレンド');
      expect(trendsLink).toHaveAttribute('aria-current', 'page');

      const homeLink = screen.getByTestId('nav-link-ホーム');
      expect(homeLink).not.toHaveAttribute('aria-current');
    });

    it('フォーカス可能な要素にフォーカススタイルがある', () => {
      render(<Header />);

      const homeLink = screen.getByTestId('nav-link-ホーム');
      expect(homeLink).toHaveClass(
        'focus-visible:ring-2 focus-visible:ring-(--tt-color-primary)'
      );
    });
  });

  describe('ホバー効果', () => {
    it('非アクティブリンクにホバー効果がある', () => {
      (usePathname as jest.Mock).mockReturnValue('/');

      render(<Header />);

      const popularLink = screen.getByTestId('nav-link-人気');
      // 拡大や塗りは使わず、文字を濃くする
      expect(popularLink).toHaveClass('hover:text-(--tt-color-text)');
      expect(popularLink).not.toHaveClass('hover:scale-105');
    });

    it('モバイルナビのリンクにホバー効果がある', async () => {
      const user = userEvent.setup();
      (usePathname as jest.Mock).mockReturnValue('/');

      render(<Header />);

      const toggleButton = screen.getByTestId('mobile-menu-toggle');
      await user.click(toggleButton);

      const popularLink = screen.getByTestId('mobile-nav-link-人気');
      expect(popularLink).toHaveClass('hover:bg-(--tt-color-surface-hover)');
    });
  });

  describe('お問い合わせの入口', () => {
    it('デスクトップとモバイルの両方に /contact へのリンクがある', () => {
      render(<Header />);

      // jsdom は CSS を当てないので、デスクトップ用とモバイル用の両方が見つかる
      const links = screen.getAllByRole('link', { name: 'お問い合わせ・要望' });
      expect(links).toHaveLength(2);
      links.forEach((link) => expect(link).toHaveAttribute('href', '/contact'));
      expect(screen.getByTestId('header-contact-link')).toBeInTheDocument();
      expect(
        screen.getByTestId('mobile-header-contact-link')
      ).toBeInTheDocument();
    });

    it('/contact では現在のページとして示す', () => {
      (usePathname as jest.Mock).mockReturnValue('/contact');

      render(<Header />);

      screen
        .getAllByRole('link', { name: 'お問い合わせ・要望' })
        .forEach((link) =>
          expect(link).toHaveAttribute('aria-current', 'page')
        );
    });

    it('ほかのページでは現在のページとして示さない', () => {
      render(<Header />);

      screen
        .getAllByRole('link', { name: 'お問い合わせ・要望' })
        .forEach((link) => expect(link).not.toHaveAttribute('aria-current'));
    });

    it('/admin ではヘッダーごと出さない', () => {
      (usePathname as jest.Mock).mockReturnValue('/admin/inquiries');

      render(<Header />);

      expect(
        screen.queryByRole('link', { name: 'お問い合わせ・要望' })
      ).not.toBeInTheDocument();
    });

    it('デスクトップ側はマウスを乗せると「お問い合わせ・要望」を出す', async () => {
      const user = userEvent.setup();
      render(<Header />);

      await user.hover(screen.getByTestId('header-contact-link'));

      expect(
        await screen.findByRole('tooltip', { name: 'お問い合わせ・要望' })
      ).toBeInTheDocument();
    });

    it('サイト名は入りきらない幅（399px 未満、1024〜1279px）で読み上げ用だけにする', () => {
      render(<Header />);

      const siteName = within(screen.getByTestId('header-logo')).getByText(
        'TechTrend'
      );
      expect(siteName).toHaveClass('max-[399px]:sr-only lg:max-xl:sr-only');
    });

    it('文字はデスクトップの 1280px 以上でだけ見せ、モバイルはアイコンだけにする', () => {
      render(<Header />);

      const desktopLabel = within(
        screen.getByTestId('header-contact-link')
      ).getByText('お問い合わせ・要望');
      expect(desktopLabel).toHaveClass('sr-only xl:not-sr-only');

      const mobileLabel = within(
        screen.getByTestId('mobile-header-contact-link')
      ).getByText('お問い合わせ・要望');
      expect(mobileLabel).toHaveClass('sr-only');
      expect(mobileLabel).not.toHaveClass('xl:not-sr-only');
    });
  });
});
