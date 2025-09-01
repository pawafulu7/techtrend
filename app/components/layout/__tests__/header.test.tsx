import React from 'react';
import { render, screen } from '@testing-library/react';
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

// コンポーネントのモック
jest.mock('@/components/theme-toggle', () => ({
  ThemeToggle: () => <button data-testid="theme-toggle">Theme Toggle</button>,
}));

jest.mock('@/components/auth/UserMenu', () => ({
  UserMenu: () => <button data-testid="user-menu">User Menu</button>,
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
      
      // 主要ナビゲーション項目
      expect(screen.getByTestId('nav-link-ホーム')).toBeInTheDocument();
      expect(screen.getByTestId('nav-link-人気')).toBeInTheDocument();
      expect(screen.getByTestId('nav-link-ダイジェスト')).toBeInTheDocument();
      expect(screen.getByTestId('nav-link-ソース')).toBeInTheDocument();
      expect(screen.getByTestId('nav-link-トレンド')).toBeInTheDocument();
      expect(screen.getByTestId('nav-link-統計')).toBeInTheDocument();
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
      expect(popularLink).toHaveClass('bg-primary', 'text-primary-foreground');
    });

    it('非アクティブなリンクは通常のスタイルで表示される', () => {
      (usePathname as jest.Mock).mockReturnValue('/');
      
      render(<Header />);
      
      const popularLink = screen.getByTestId('nav-link-人気');
      expect(popularLink).not.toHaveAttribute('aria-current');
      expect(popularLink).toHaveClass('bg-secondary/30');
    });
  });

  describe('モバイルナビゲーション', () => {
    it('モバイルメニューを開閉できる', async () => {
      const user = userEvent.setup();
      render(<Header />);
      
      // 初期状態でモバイルナビは非表示
      expect(screen.queryByTestId('mobile-nav')).not.toBeInTheDocument();
      
      // メニューボタンをクリックして開く
      const toggleButton = screen.getByTestId('mobile-menu-toggle');
      await user.click(toggleButton);
      
      // モバイルナビが表示される
      expect(screen.getByTestId('mobile-nav')).toBeInTheDocument();
      
      // モバイルナビゲーション項目が表示される
      expect(screen.getByTestId('mobile-nav-link-ホーム')).toBeInTheDocument();
      expect(screen.getByTestId('mobile-nav-link-人気')).toBeInTheDocument();
      
      // 再度クリックして閉じる
      await user.click(toggleButton);
      
      // モバイルナビが非表示になる
      expect(screen.queryByTestId('mobile-nav')).not.toBeInTheDocument();
    });

    it('モバイルメニューにセカンダリナビゲーションが含まれる', async () => {
      const user = userEvent.setup();
      render(<Header />);
      
      const toggleButton = screen.getByTestId('mobile-menu-toggle');
      await user.click(toggleButton);
      
      // セカンダリナビゲーション項目
      expect(screen.getByTestId('mobile-secondary-nav-link-閲覧履歴')).toBeInTheDocument();
      expect(screen.getByTestId('mobile-secondary-nav-link-おすすめ')).toBeInTheDocument();
      expect(screen.getByTestId('mobile-secondary-nav-link-タグ')).toBeInTheDocument();
      expect(screen.getByTestId('mobile-secondary-nav-link-分析')).toBeInTheDocument();
      
      // セクション見出し
      expect(screen.getByText('その他')).toBeInTheDocument();
    });

    it('モバイルナビのリンククリックでメニューが閉じる', async () => {
      const user = userEvent.setup();
      render(<Header />);
      
      // メニューを開く
      const toggleButton = screen.getByTestId('mobile-menu-toggle');
      await user.click(toggleButton);
      
      // モバイルナビが表示される
      expect(screen.getByTestId('mobile-nav')).toBeInTheDocument();
      
      // リンクをクリック
      const homeLink = screen.getByTestId('mobile-nav-link-ホーム');
      await user.click(homeLink);
      
      // モバイルナビが閉じる
      expect(screen.queryByTestId('mobile-nav')).not.toBeInTheDocument();
    });

    it('モバイルナビでもアクティブ状態が表示される', async () => {
      const user = userEvent.setup();
      (usePathname as jest.Mock).mockReturnValue('/tags');
      
      render(<Header />);
      
      const toggleButton = screen.getByTestId('mobile-menu-toggle');
      await user.click(toggleButton);
      
      const tagsLink = screen.getByTestId('mobile-secondary-nav-link-タグ');
      expect(tagsLink).toHaveAttribute('aria-current', 'page');
      expect(tagsLink).toHaveClass('bg-primary', 'text-primary-foreground');
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
      
      const links = [
        { testId: 'nav-link-ホーム', href: '/' },
        { testId: 'nav-link-人気', href: '/popular' },
        { testId: 'nav-link-ダイジェスト', href: '/digest' },
        { testId: 'nav-link-ソース', href: '/sources' },
        { testId: 'nav-link-トレンド', href: '/trends' },
        { testId: 'nav-link-統計', href: '/stats' },
      ];
      
      links.forEach(link => {
        const element = screen.getByTestId(link.testId);
        expect(element).toHaveAttribute('href', link.href);
      });
    });
  });

  describe('レスポンシブ表示', () => {
    it('デスクトップナビはmd以上で表示される', () => {
      render(<Header />);
      
      const desktopNav = screen.getByTestId('desktop-nav');
      expect(desktopNav).toHaveClass('hidden', 'md:flex');
    });

    it('モバイルメニューボタンはmd未満で表示される', () => {
      render(<Header />);
      
      const mobileMenuToggle = screen.getByTestId('mobile-menu-toggle').parentElement;
      expect(mobileMenuToggle).toHaveClass('md:hidden');
    });

    it('モバイルナビはmd未満でのみ表示される', async () => {
      const user = userEvent.setup();
      render(<Header />);
      
      const toggleButton = screen.getByTestId('mobile-menu-toggle');
      await user.click(toggleButton);
      
      const mobileNav = screen.getByTestId('mobile-nav');
      expect(mobileNav).toHaveClass('md:hidden');
    });
  });

  describe('スティッキーヘッダー', () => {
    it('スティッキー位置が設定されている', () => {
      const { container } = render(<Header />);
      
      const header = container.querySelector('header');
      expect(header).toHaveClass('sticky', 'top-0', 'z-50');
    });

    it('背景ぼかし効果が適用されている', () => {
      const { container } = render(<Header />);
      
      const header = container.querySelector('header');
      expect(header).toHaveClass('backdrop-blur');
    });
  });

  describe('アクセシビリティ', () => {
    it('aria-current属性が正しく設定される', () => {
      (usePathname as jest.Mock).mockReturnValue('/stats');
      
      render(<Header />);
      
      const statsLink = screen.getByTestId('nav-link-統計');
      expect(statsLink).toHaveAttribute('aria-current', 'page');
      
      const homeLink = screen.getByTestId('nav-link-ホーム');
      expect(homeLink).not.toHaveAttribute('aria-current');
    });

    it('フォーカス可能な要素にフォーカススタイルがある', () => {
      render(<Header />);
      
      const homeLink = screen.getByTestId('nav-link-ホーム');
      expect(homeLink).toHaveClass('focus-visible:ring-2', 'focus-visible:ring-primary');
    });
  });

  describe('ホバー効果', () => {
    it('非アクティブリンクにホバー効果がある', () => {
      (usePathname as jest.Mock).mockReturnValue('/');
      
      render(<Header />);
      
      const popularLink = screen.getByTestId('nav-link-人気');
      expect(popularLink).toHaveClass('hover:bg-secondary/60', 'hover:scale-105');
    });

    it('モバイルナビのリンクにホバー効果がある', async () => {
      const user = userEvent.setup();
      (usePathname as jest.Mock).mockReturnValue('/');
      
      render(<Header />);
      
      const toggleButton = screen.getByTestId('mobile-menu-toggle');
      await user.click(toggleButton);
      
      const popularLink = screen.getByTestId('mobile-nav-link-人気');
      expect(popularLink).toHaveClass('hover:bg-secondary/50');
    });
  });
});