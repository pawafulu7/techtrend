import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { SavePresetDialog } from '@/app/components/source-filters/save-preset-dialog';

describe('SavePresetDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: jest.fn(),
    onSave: jest.fn().mockResolvedValue(undefined),
    isSaving: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ダイアログが開いている時に表示される', () => {
    render(<SavePresetDialog {...defaultProps} />);
    expect(screen.getByText('プリセットを保存')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('プリセット名')).toBeInTheDocument();
  });

  it('名前を入力して保存できる', async () => {
    const user = userEvent.setup();
    render(<SavePresetDialog {...defaultProps} />);

    const input = screen.getByPlaceholderText('プリセット名');
    await user.type(input, 'My Preset');
    await user.click(screen.getByText('保存'));

    expect(defaultProps.onSave).toHaveBeenCalledWith('My Preset');
  });

  it('空の名前では保存ボタンが無効になる', () => {
    render(<SavePresetDialog {...defaultProps} />);

    const saveButton = screen.getByRole('button', { name: '保存' });
    expect(saveButton).toBeDisabled();
    expect(defaultProps.onSave).not.toHaveBeenCalled();
  });

  it('保存中はローディング表示', () => {
    render(<SavePresetDialog {...defaultProps} isSaving={true} />);
    expect(screen.getByText('保存中...')).toBeInTheDocument();
  });

  it('重複名エラーを表示する', async () => {
    const user = userEvent.setup();
    const onSave = jest
      .fn()
      .mockRejectedValue(new Error('Preset name already exists'));
    render(<SavePresetDialog {...defaultProps} onSave={onSave} />);

    const input = screen.getByPlaceholderText('プリセット名');
    await user.type(input, 'Existing Name');
    await user.click(screen.getByText('保存'));

    await waitFor(() => {
      expect(
        screen.getByText('この名前は既に使われています')
      ).toBeInTheDocument();
    });
  });

  it('キャンセルでダイアログを閉じる', async () => {
    const user = userEvent.setup();
    render(<SavePresetDialog {...defaultProps} />);

    await user.click(screen.getByText('キャンセル'));
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });
});
