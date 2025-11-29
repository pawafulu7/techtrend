import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { PresetFilters, presets } from '@/app/components/popular/preset-filters';

describe('PresetFilters', () => {
  const mockOnPresetChange = jest.fn();

  const defaultProps = {
    selectedPreset: null,
    onPresetChange: mockOnPresetChange,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all preset options', () => {
    render(<PresetFilters {...defaultProps} />);

    expect(screen.getByRole('group', { name: 'クイックフィルタープリセット' })).toBeInTheDocument();

    presets.forEach((preset) => {
      expect(screen.getByRole('radio', { name: preset.label })).toBeInTheDocument();
    });
  });

  it('calls onPresetChange when a preset is selected', async () => {
    const user = userEvent.setup();

    render(<PresetFilters {...defaultProps} />);

    const hotButton = screen.getByRole('radio', { name: 'トレンド' });
    await user.click(hotButton);

    expect(mockOnPresetChange).toHaveBeenCalledWith('hot', 'today', 'combined');
  });

  it('selects correct preset based on selectedPreset prop', () => {
    render(<PresetFilters {...defaultProps} selectedPreset="quality" />);

    const qualityButton = screen.getByRole('radio', { name: '高品質' });
    expect(qualityButton).toHaveAttribute('data-state', 'on');
  });

  it('calls onPresetChange with null when deselecting', async () => {
    const user = userEvent.setup();

    render(<PresetFilters {...defaultProps} selectedPreset="hot" />);

    const hotButton = screen.getByRole('radio', { name: 'トレンド' });
    await user.click(hotButton);

    // Deselecting should reset to defaults
    expect(mockOnPresetChange).toHaveBeenCalledWith(null, 'week', 'combined');
  });

  it('applies correct styles to selected preset', () => {
    render(<PresetFilters {...defaultProps} selectedPreset="popular" />);

    const popularButton = screen.getByRole('radio', { name: '人気' });
    expect(popularButton).toHaveAttribute('data-state', 'on');
    expect(popularButton).toHaveClass('rounded-full');
  });

  it('has correct touch target size', () => {
    render(<PresetFilters {...defaultProps} />);

    const buttons = screen.getAllByRole('radio');
    buttons.forEach((button) => {
      expect(button).toHaveClass('min-h-[44px]');
    });
  });

  it('applies custom className', () => {
    render(<PresetFilters {...defaultProps} className="custom-filters" />);

    const group = screen.getByRole('group', { name: 'クイックフィルタープリセット' });
    expect(group).toHaveClass('custom-filters');
  });

  it('supports keyboard navigation', async () => {
    const user = userEvent.setup();

    render(<PresetFilters {...defaultProps} />);

    const firstButton = screen.getByRole('radio', { name: 'トレンド' });
    firstButton.focus();

    // Press right arrow to move to next option
    await user.keyboard('{ArrowRight}');

    const secondButton = screen.getByRole('radio', { name: '高品質' });
    expect(secondButton).toHaveFocus();
  });

  it('exports presets constant', () => {
    expect(presets).toHaveLength(3);
    expect(presets[0]).toEqual({
      id: 'hot',
      label: 'トレンド',
      period: 'today',
      metric: 'combined',
    });
    expect(presets[1]).toEqual({
      id: 'quality',
      label: '高品質',
      period: 'week',
      metric: 'quality',
    });
    expect(presets[2]).toEqual({
      id: 'popular',
      label: '人気',
      period: 'month',
      metric: 'bookmarks',
    });
  });
});
