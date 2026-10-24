/**
 * PersonalizationToggle（ホームのツールバーのパーソナライズのボタン）
 *
 * 押すと分野の設定のダイアログが開く普通のボタンで、絞り込みの状態は見た目と読み上げの文字で伝える。
 */

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { PersonalizationToggle } from '@/app/components/personalization/personalization-toggle';
import { usePersonalizationPreferences } from '@/lib/hooks/use-personalization-preferences';

jest.mock('@/lib/hooks/use-personalization-preferences', () => ({
  usePersonalizationPreferences: jest.fn(),
}));

// ダイアログの中身はこのテストの対象外。開いているかと、渡した props だけを見る
const mockDialogProps = jest.fn();
jest.mock(
  '@/app/components/personalization/category-preference-dialog',
  () => ({
    CategoryPreferenceDialog: (props: { open: boolean }) => {
      mockDialogProps(props);
      return props.open ? <div role="dialog">分野の設定</div> : null;
    },
  })
);

type DialogProps = {
  homeFilterEnabled?: boolean;
  onSave: (
    categories: string[],
    period: number,
    homeFilterEnabled: boolean
  ) => Promise<void>;
};
const lastDialogProps = (): DialogProps =>
  mockDialogProps.mock.calls.at(-1)?.[0] as DialogProps;

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
    updatePreferencesAsync,
    isUpdating: false,
    hasPreferences: selected.length > 0,
  });
}
const updatePreferencesAsync = jest.fn();

describe('PersonalizationToggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('分野を選んでいないときは、絞り込みオフと読み上げ、数のバッジを出さない', () => {
    mockPreferences({ selected: [], filterEnabled: false });
    render(<PersonalizationToggle />);

    const button = screen.getByTestId('personalization-toggle');
    expect(button).toHaveAccessibleName('パーソナライズ （絞り込みオフ）');
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

  it('分野を選んでいても絞り込みを止めているときは、絞り込みオフと読み上げ、塗らない', () => {
    mockPreferences({ selected: ['a', 'b'], filterEnabled: false });
    render(<PersonalizationToggle />);

    const button = screen.getByTestId('personalization-toggle');
    expect(button).toHaveAccessibleName(
      'パーソナライズ 選んだ分野 2 （絞り込みオフ）'
    );
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

  describe('ホームの絞り込みのスイッチ（分野はダイジェストと共通、Issue #709）', () => {
    it('まだ分野を選んでいないときは、オンから始める', () => {
      mockPreferences({ selected: [], filterEnabled: false });
      render(<PersonalizationToggle />);

      expect(lastDialogProps().homeFilterEnabled).toBe(true);
    });

    it('ダイジェストで分野を選んだだけ（絞り込みオフ）なら、オフから始める', () => {
      mockPreferences({ selected: ['a'], filterEnabled: false });
      render(<PersonalizationToggle />);

      expect(lastDialogProps().homeFilterEnabled).toBe(false);
    });

    it('保存すると、スイッチの値で絞り込みを保存する。分野が 0 件ならオフにする', async () => {
      mockPreferences({ selected: ['a'], filterEnabled: false });
      render(<PersonalizationToggle />);

      await act(() => lastDialogProps().onSave(['a', 'b'], 6, true));
      expect(updatePreferencesAsync).toHaveBeenLastCalledWith({
        categoryIds: ['a', 'b'],
        filterEnabled: true,
        periodMonths: 6,
      });

      await act(() => lastDialogProps().onSave([], 6, true));
      expect(updatePreferencesAsync).toHaveBeenLastCalledWith({
        categoryIds: [],
        filterEnabled: false,
        periodMonths: 6,
      });
    });

    it('分野を変えずにスイッチだけを変えたときは、分野を送らない（別の画面で変えた分野を戻さない）', async () => {
      mockPreferences({ selected: ['a', 'b'], filterEnabled: false });
      render(<PersonalizationToggle />);

      await act(() => lastDialogProps().onSave(['b', 'a'], 3, true));
      expect(updatePreferencesAsync).toHaveBeenLastCalledWith({
        filterEnabled: true,
        periodMonths: 3,
      });
    });
  });
});
