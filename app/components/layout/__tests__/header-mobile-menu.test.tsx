/**
 * ヘッダーのモバイルメニュー（app/components/layout/header.tsx）
 *
 * 開閉、Esc・ヘッダーの外のクリック・ページの移動で閉じること、閉じたときのフォーカスの行き先を確かめる。
 * ナビの見た目とお問い合わせの入口は header.test.tsx。
 */

import React from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { Header } from '@/app/components/layout/header';
import { usePathname } from 'next/navigation';

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

jest.mock('@/lib/constants', () => ({
  SITE_NAME: 'TechTrend',
}));

// better-auth の client は ESM のため、Jest では実体を読み込ませずモックする
jest.mock('@/lib/auth/auth-client', () => ({
  authClient: {
    useSession: jest.fn().mockReturnValue({ data: null, isPending: false }),
    signIn: { email: jest.fn(), social: jest.fn() },
    signOut: jest.fn(),
    signUp: { email: jest.fn() },
  },
}));

jest.mock('@/components/theme-toggle', () => ({
  ThemeToggle: () => <button data-testid="theme-toggle">Theme Toggle</button>,
}));

jest.mock('@/components/auth/UserMenu', () => ({
  UserMenu: () => <button data-testid="user-menu">User Menu</button>,
}));

jest.mock('@/app/components/layout/nav-dropdown', () => ({
  NavDropdown: () => <div data-testid="nav-dropdown">その他</div>,
}));

const mockedUsePathname = usePathname as jest.Mock;

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('mobile-menu-toggle'));
  expect(screen.getByTestId('mobile-nav')).toBeInTheDocument();
}

describe('Header のモバイルメニュー', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUsePathname.mockReturnValue('/');
  });

  describe('開閉と中身', () => {
    it('メニューのボタンで開閉できる', async () => {
      const user = userEvent.setup();
      render(<Header />);

      expect(screen.queryByTestId('mobile-nav')).not.toBeInTheDocument();

      await openMenu(user);
      expect(screen.getByTestId('mobile-nav-link-ホーム')).toBeInTheDocument();
      expect(screen.getByTestId('mobile-nav-link-人気')).toBeInTheDocument();

      await user.click(screen.getByTestId('mobile-menu-toggle'));
      expect(screen.queryByTestId('mobile-nav')).not.toBeInTheDocument();
    });

    it('セカンダリナビゲーションも含む', async () => {
      const user = userEvent.setup();
      render(<Header />);

      await openMenu(user);

      expect(
        screen.getByTestId('mobile-secondary-nav-link-閲覧履歴')
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('mobile-secondary-nav-link-タグ')
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('mobile-secondary-nav-link-分析')
      ).toBeInTheDocument();
      expect(
        within(screen.getByTestId('mobile-nav')).getByText('その他')
      ).toBeInTheDocument();
    });

    it('今のページの項目を選ばれている表示にする', async () => {
      const user = userEvent.setup();
      mockedUsePathname.mockReturnValue('/tags');
      render(<Header />);

      await openMenu(user);

      const tagsLink = screen.getByTestId('mobile-secondary-nav-link-タグ');
      expect(tagsLink).toHaveAttribute('aria-current', 'page');
      expect(tagsLink).toHaveClass(
        'bg-(--tt-color-primary-bg) text-(--tt-color-primary)'
      );
    });

    it('メニューのリンクを押すと閉じる', async () => {
      const user = userEvent.setup();
      render(<Header />);

      await openMenu(user);
      await user.click(screen.getByTestId('mobile-nav-link-ホーム'));

      expect(screen.queryByTestId('mobile-nav')).not.toBeInTheDocument();
    });
  });

  describe('Esc で閉じる', () => {
    it('パネルの中にフォーカスがあれば、閉じて開いたボタンへ戻す', async () => {
      const user = userEvent.setup();
      render(<Header />);

      await openMenu(user);
      // トグルを押した直後はトグルにフォーカスがあるので、パネルの中へ移してから Esc を押す
      screen.getByTestId('mobile-nav-link-人気').focus();
      await user.keyboard('{Escape}');

      expect(screen.queryByTestId('mobile-nav')).not.toBeInTheDocument();
      expect(screen.getByTestId('mobile-menu-toggle')).toHaveFocus();
    });

    it('本文にあるフォーカスは動かさない', async () => {
      const user = userEvent.setup();
      render(
        <>
          <Header />
          <button data-testid="outside">本文のボタン</button>
        </>
      );

      await openMenu(user);
      screen.getByTestId('outside').focus();
      await user.keyboard('{Escape}');

      expect(screen.queryByTestId('mobile-nav')).not.toBeInTheDocument();
      expect(screen.getByTestId('outside')).toHaveFocus();
    });

    it('ほかの部品が先に Esc を使ったら閉じない（Radix のメニューは capture で preventDefault する）', async () => {
      const user = userEvent.setup();
      const consumeEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') event.preventDefault();
      };
      document.addEventListener('keydown', consumeEscape, { capture: true });
      try {
        render(<Header />);
        await openMenu(user);
        await user.keyboard('{Escape}');

        expect(screen.getByTestId('mobile-nav')).toBeInTheDocument();
      } finally {
        document.removeEventListener('keydown', consumeEscape, {
          capture: true,
        });
      }
    });

    it('変換中の Esc では閉じない', async () => {
      const user = userEvent.setup();
      render(<Header />);

      await openMenu(user);
      // act で包まないと、閉じる更新が反映される前に確かめてしまい、閉じても通る
      const dispatchEscape = (isComposing: boolean) =>
        act(() => {
          document.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: 'Escape',
              isComposing,
              bubbles: true,
            })
          );
        });

      dispatchEscape(true);
      expect(screen.getByTestId('mobile-nav')).toBeInTheDocument();

      // 同じ送り方で、変換していない Esc なら閉じる（送り方が効いていることの確かめ）
      dispatchEscape(false);
      expect(screen.queryByTestId('mobile-nav')).not.toBeInTheDocument();
    });
  });

  describe('ヘッダーの外のクリックで閉じる', () => {
    it('外を押すと閉じ、押したものにも click が届く', async () => {
      const user = userEvent.setup();
      const onOutsideClick = jest.fn();
      render(
        <>
          <Header />
          <button data-testid="outside" onClick={onOutsideClick}>
            本文のボタン
          </button>
        </>
      );

      await openMenu(user);
      await user.click(screen.getByTestId('outside'));

      expect(screen.queryByTestId('mobile-nav')).not.toBeInTheDocument();
      expect(onOutsideClick).toHaveBeenCalledTimes(1);
    });

    it('押し始めただけ（pointerdown）では閉じない', async () => {
      const user = userEvent.setup();
      render(
        <>
          <Header />
          <p data-testid="outside">本文</p>
        </>
      );

      await openMenu(user);
      // 閉じるのを click まで待つ。押し始めで閉じると、本文が上にずれてから指が離れ、タップが別の要素に届く
      await user.pointer({
        keys: '[MouseLeft>]',
        target: screen.getByTestId('outside'),
      });

      expect(screen.getByTestId('mobile-nav')).toBeInTheDocument();
    });

    it('ヘッダーの中を押しても閉じない', async () => {
      const user = userEvent.setup();
      render(<Header />);

      await openMenu(user);
      await user.click(screen.getByTestId('header-logo'));

      expect(screen.getByTestId('mobile-nav')).toBeInTheDocument();
    });
  });

  describe('ページの移動で閉じる', () => {
    it('別のページに移ると閉じ、戻っても開き直さない', async () => {
      const user = userEvent.setup();
      mockedUsePathname.mockReturnValue('/tags');
      const { rerender } = render(<Header />);

      await openMenu(user);

      // ロゴ・ユーザーメニューからの移動や、ブラウザの戻る・進むで、パスだけが変わる
      mockedUsePathname.mockReturnValue('/profile');
      rerender(<Header />);
      expect(screen.queryByTestId('mobile-nav')).not.toBeInTheDocument();

      mockedUsePathname.mockReturnValue('/tags');
      rerender(<Header />);
      expect(screen.queryByTestId('mobile-nav')).not.toBeInTheDocument();
    });
  });

  describe('document に付けた処理の後始末', () => {
    it('閉じたときと、開いたまま外したときに外す', async () => {
      const user = userEvent.setup();
      const addSpy = jest.spyOn(document, 'addEventListener');
      const removeSpy = jest.spyOn(document, 'removeEventListener');
      // メニューが付けた処理だけを取り出す（userEvent や Radix も document に付け外しする）
      const addedByMenu = () => {
        const keydown = addSpy.mock.calls.filter(
          ([type, , options]) => type === 'keydown' && options === undefined
        );
        const click = addSpy.mock.calls.filter(
          ([type, , options]) => type === 'click' && options === true
        );
        expect(keydown).toHaveLength(1);
        expect(click).toHaveLength(1);
        return { keydown: keydown[0][1], click: click[0][1] };
      };
      const expectRemoved = ({
        keydown,
        click,
      }: ReturnType<typeof addedByMenu>) => {
        expect(removeSpy).toHaveBeenCalledWith('keydown', keydown);
        expect(removeSpy).toHaveBeenCalledWith('click', click, true);
      };

      try {
        const { unmount } = render(<Header />);

        await openMenu(user);
        const first = addedByMenu();
        await user.click(screen.getByTestId('mobile-menu-toggle'));
        expectRemoved(first);

        addSpy.mockClear();
        removeSpy.mockClear();
        await openMenu(user);
        const second = addedByMenu();
        unmount();
        expectRemoved(second);
      } finally {
        addSpy.mockRestore();
        removeSpy.mockRestore();
      }
    });
  });
});
