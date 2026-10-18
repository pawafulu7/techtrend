/**
 * PersonalizationToggle（ホームのツールバーのパーソナライズのボタン）
 *
 * 押すと分野の設定のダイアログが開く普通のボタンで、絞り込みの状態は見た目と読み上げの文字で伝える。
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { PersonalizationToggle } from '@/app/components/personalization/personalization-toggle';
import { usePersonalizationPreferences } from '@/lib/hooks/use-personalization-preferences';

jest.mock('@/lib/hooks/use-personalization-preferences', () => ({
  usePersonalizationPreferences: jest.fn(),
}));

// ダイアログの中身はこのテストの対象外。開いているかだけを見る
jest.mock(
  '@/app/components/personalization/category-preference-dialog',
  () => ({
    CategoryPreferenceDialog: ({ open }: { open: boolean }) =>
      open ? <div role="dialog">分野の設定</div> : null,
  })
);

const mockedUsePreferences = usePersonalizationPreferences as jest.Mock;

function mockPreferences({
  selected,
  filterEnabled,
}: {
  selected: string[];
  filterEnabled: boolean;
}) {
  mockedUsePreferences.mockReturnValue({
    categories: [],
    selectedCategories: selected,
    filterEnabled,
    periodMonths: 3,
    isLoading: false,
    updatePreferencesAsync: jest.fn(),
    isUpdating: false,
    hasPreferences: selected.length > 0,
  });
}

describe('PersonalizationToggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('分野を選んでいないときは、オフと読み上げ、数のバッジを出さない', () => {
    mockPreferences({ selected: [], filterEnabled: false });
    render(<PersonalizationToggle />);

    const button = screen.getByTestId('personalization-toggle');
    expect(button).toHaveAccessibleName('パーソナライズ （オフ）');
    expect(button).not.toHaveTextContent(/\d/);
  });

  it('絞り込み中は、選んだ分野の数と状態を読み上げ、藍の塗りで示す', () => {
    mockPreferences({ selected: ['a', 'b', 'c'], filterEnabled: true });
    render(<PersonalizationToggle />);

    const button = screen.getByTestId('personalization-toggle');
    expect(button).toHaveAccessibleName(
      'パーソナライズ 選んだ分野 3 （絞り込み中）'
    );
    expect(button).toHaveClass(
      'bg-(--tt-color-primary-bg) text-(--tt-color-primary)'
    );
  });

  it('分野を選んでいても絞り込みを止めているときは、オフと読み上げ、塗らない', () => {
    mockPreferences({ selected: ['a', 'b'], filterEnabled: false });
    render(<PersonalizationToggle />);

    const button = screen.getByTestId('personalization-toggle');
    expect(button).toHaveAccessibleName('パーソナライズ 選んだ分野 2 （オフ）');
    expect(button).not.toHaveClass('bg-(--tt-color-primary-bg)');
  });

  it('押すと設定のダイアログが開くことを伝え、切り替えのボタンとしては読み上げない', async () => {
    const user = userEvent.setup();
    mockPreferences({ selected: [], filterEnabled: false });
    render(<PersonalizationToggle />);

    const button = screen.getByTestId('personalization-toggle');
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).not.toHaveAttribute('aria-pressed');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(button);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
