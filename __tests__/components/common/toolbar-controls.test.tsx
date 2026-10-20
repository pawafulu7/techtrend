/**
 * ホームのツールバーの部品（並び順・表示形式・タグの絞り込み）
 *
 * 選ばれているボタンの判定、読み上げの名前、更新中の扱い、開く部品の種類を確かめる。
 * パーソナライズのボタンは personalization/personalization-toggle.test.tsx。
 */

import React from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { SortButtons } from '@/app/components/common/sort-buttons';
import { ViewModeToggle } from '@/app/components/common/view-mode-toggle';
import { TagFilterDropdown } from '@/app/components/common/tag-filter-dropdown';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockRefresh = jest.fn();
let mockSearch = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: mockRefresh,
  }),
  useSearchParams: () => mockSearch,
  usePathname: () => '/',
}));

jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));

// タグの一覧の中身はこのテストの対象外。開いたかだけを見る
jest.mock('@/app/components/common/tag-filter', () => ({
  TagFilter: () => <div>タグの一覧</div>,
}));

const fetchMock = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockSearch = new URLSearchParams();
  fetchMock.mockResolvedValue({ ok: true });
  global.fetch = fetchMock as unknown as typeof fetch;
});

function pressedLabels() {
  const group = screen.getByRole('group', { name: '並び順' });
  return within(group)
    .getAllByRole('button')
    .filter((button) => button.getAttribute('aria-pressed') === 'true')
    .map((button) => button.textContent);
}

describe('SortButtons', () => {
  it('URL の並び順のボタンだけを選ばれている表示にする', () => {
    mockSearch = new URLSearchParams('sortBy=qualityScore');
    render(<SortButtons />);

    expect(pressedLabels()).toEqual(['品質']);
  });

  it('API が受け付けない値は、API と同じく公開順にする', () => {
    mockSearch = new URLSearchParams('sortBy=bogus');
    render(<SortButtons />);

    expect(pressedLabels()).toEqual(['公開順']);
  });

  it('受け付けるがボタンの無い並び順では、どのボタンも選ばれていない表示にする', () => {
    mockSearch = new URLSearchParams('sortBy=userVotes');
    render(<SortButtons />);

    expect(pressedLabels()).toEqual([]);
  });

  it('空の sortBy は指定なしとして、サーバーから渡された並び順を使う', () => {
    mockSearch = new URLSearchParams('sortBy=');
    render(<SortButtons initialSortBy="bookmarks" />);

    expect(pressedLabels()).toEqual(['人気']);
  });

  it('押すと URL と Cookie の並び順を変える', async () => {
    const user = userEvent.setup();
    render(<SortButtons />);

    await user.click(screen.getByRole('button', { name: '品質' }));

    expect(mockPush).toHaveBeenCalledWith('/?sortBy=qualityScore');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/filter-preferences',
      expect.objectContaining({
        body: JSON.stringify({ sortBy: 'qualityScore' }),
      })
    );
    expect(pressedLabels()).toEqual(['品質']);
  });
});

describe('ViewModeToggle', () => {
  it('今の表示形式のボタンを選ばれている表示にし、組に名前を付ける', () => {
    render(<ViewModeToggle currentMode="list" />);

    const group = screen.getByRole('group', { name: '表示形式' });
    expect(
      within(group).getByRole('button', { name: 'リスト表示' })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(group).getByRole('button', { name: 'カード表示' })
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('更新中は押しても送らず、押したボタンのフォーカスを外さない', async () => {
    const user = userEvent.setup();
    let finish: (value: { ok: boolean }) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    render(<ViewModeToggle currentMode="card" />);

    const compact = screen.getByRole('button', { name: 'コンパクト表示' });
    await user.click(compact);

    // ネイティブの disabled にすると、押したボタンからフォーカスが body に落ちる
    expect(compact).not.toBeDisabled();
    expect(compact).toHaveAttribute('aria-disabled', 'true');
    expect(compact).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'リスト表示' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish({ ok: true });
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(compact).not.toHaveAttribute('aria-disabled');
  });
});

describe('TagFilterDropdown', () => {
  it('選んだタグの数を、何の数かと一緒に読み上げる', () => {
    mockSearch = new URLSearchParams('tags=React,TypeScript');
    render(<TagFilterDropdown tags={[]} />);

    expect(screen.getByTestId('tag-filter-button')).toHaveAccessibleName(
      'タグ 選んだタグ 2'
    );
  });

  it('中身はメニューの項目ではないので、メニューではなくダイアログとして開く', async () => {
    const user = userEvent.setup();
    render(<TagFilterDropdown tags={[]} />);

    const button = screen.getByTestId('tag-filter-button');
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');

    await user.click(button);

    const panel = screen.getByRole('dialog');
    expect(panel).toHaveAttribute('data-testid', 'tag-dropdown');
    expect(within(panel).getByText('タグの一覧')).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
