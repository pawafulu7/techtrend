/**
 * コマンドパレット（Issue #704）
 *
 * ⌘K / Ctrl+K で開き、ページへの移動と記事のキーワード検索ができる。入力欄にフォーカスがあるときは奪わず、
 * Esc で閉じて元の場所へフォーカスを戻す。
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { authClient } from '@/lib/auth/auth-client';
import {
  CommandPaletteProvider,
  CommandPaletteTrigger,
} from '@/app/components/layout/command-palette';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
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

function renderPalette() {
  return render(
    <CommandPaletteProvider>
      <a href="/somewhere">本文のリンク</a>
      <input aria-label="記事の検索欄" />
      <CommandPaletteTrigger />
    </CommandPaletteProvider>
  );
}

const DIALOG_NAME = 'ページを開く・記事を検索';

describe('CommandPalette', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockUseSession.mockReturnValue({ data: null, isPending: false });
  });

  it.each(['{Control>}k{/Control}', '{Meta>}k{/Meta}'])(
    '%s で開き、入力欄にフォーカスを移す',
    async (keys) => {
      const user = userEvent.setup();
      renderPalette();

      await user.keyboard(keys);

      expect(
        screen.getByRole('dialog', { name: DIALOG_NAME })
      ).toBeInTheDocument();
      expect(screen.getByRole('combobox')).toHaveFocus();
    }
  );

  it('Ctrl+Shift+K（AI 検索の入力欄へ移るキー）では開かない', async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.keyboard('{Control>}{Shift>}k{/Shift}{/Control}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('入力欄にフォーカスがあるときは開かない', async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.click(screen.getByRole('textbox', { name: '記事の検索欄' }));
    await user.keyboard('{Control>}k{/Control}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Esc で閉じ、開く前にフォーカスがあった場所へ戻す', async () => {
    const user = userEvent.setup();
    renderPalette();

    const link = screen.getByRole('link', { name: '本文のリンク' });
    link.focus();
    await user.keyboard('{Control>}k{/Control}');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(link).toHaveFocus();
  });

  it('入口のボタンでも開く', async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.click(screen.getByTestId('command-palette-trigger'));

    expect(
      screen.getByRole('dialog', { name: DIALOG_NAME })
    ).toBeInTheDocument();
  });

  it('ページの名前を選ぶと、そのページへ移る', async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.keyboard('{Control>}k{/Control}');
    await user.keyboard('リーダー');
    await user.keyboard('{Enter}');

    expect(mockPush).toHaveBeenCalledWith('/reader');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ページの名前に当たらない語は、Enter でその語の記事を検索する', async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.keyboard('{Control>}k{/Control}');
    await user.keyboard('kubernetes');

    expect(
      screen.getByRole('option', { name: '「kubernetes」で記事を検索' })
    ).toBeInTheDocument();
    await user.keyboard('{Enter}');

    expect(mockPush).toHaveBeenCalledWith('/?search=kubernetes');
  });

  it('ログインしていなければ、ログインが要るページ（お気に入り・閲覧履歴・管理画面）を出さない', async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.keyboard('{Control>}k{/Control}');

    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(
      expect.arrayContaining(['ホーム', 'リーダー', 'トレンド', 'タグ'])
    );
    expect(options).not.toContain('お気に入り');
    expect(options).not.toContain('閲覧履歴・読書分析');
    expect(options).not.toContain('AI検索');
    expect(options).not.toContain('管理画面');
  });

  it('管理者には、AI 検索・閲覧履歴・管理画面も出す', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'u1', role: 'admin' } },
      isPending: false,
    });
    const user = userEvent.setup();
    renderPalette();

    await user.keyboard('{Control>}k{/Control}');

    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(
      expect.arrayContaining(['AI検索', '閲覧履歴・読書分析', '管理画面'])
    );
  });
});
