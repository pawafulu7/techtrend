/**
 * PeriodSelector Component Tests
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { PeriodSelector } from '@/app/components/personalization/period-selector';
import type { PeriodPreset } from '@/lib/personalization/types';

describe('PeriodSelector', () => {
  const mockOnChange = jest.fn();

  const defaultProps = {
    value: 12 as PeriodPreset,
    onChange: mockOnChange,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all period options', () => {
    render(<PeriodSelector {...defaultProps} />);

    // The ToggleGroup container exposes aria-label="対象期間". The underlying ARIA
    // role differs across @radix-ui/react-toggle-group versions (group ↔ radiogroup),
    // so query by accessible name instead of hard-coding the role.
    const group = screen.getByLabelText('対象期間');
    expect(group).toBeInTheDocument();
    // Still assert the root keeps a grouping role so we catch accessibility regressions
    // (e.g. radix dropping the role entirely) — accept either group or radiogroup.
    expect(['group', 'radiogroup']).toContain(group.getAttribute('role'));
    expect(screen.getByTestId('period-3')).toBeInTheDocument();
    expect(screen.getByTestId('period-6')).toBeInTheDocument();
    expect(screen.getByTestId('period-12')).toBeInTheDocument();
    expect(screen.getByTestId('period-0')).toBeInTheDocument();
  });

  it('shows selected period', () => {
    render(<PeriodSelector {...defaultProps} value={12} />);

    const selected = screen.getByTestId('period-12');
    expect(selected).toHaveAttribute('data-state', 'on');
  });

  it('calls onChange when period is selected', async () => {
    const user = userEvent.setup();
    render(<PeriodSelector {...defaultProps} />);

    const option3m = screen.getByTestId('period-3');
    await user.click(option3m);

    expect(mockOnChange).toHaveBeenCalledWith(3);
  });

  it('displays correct helper text for months', () => {
    render(<PeriodSelector {...defaultProps} value={6} />);

    expect(
      screen.getByText('過去6ヶ月の記事を対象にします')
    ).toBeInTheDocument();
  });

  it('displays correct helper text for all time', () => {
    render(<PeriodSelector {...defaultProps} value={0} />);

    expect(screen.getByText('全期間の記事を対象にします')).toBeInTheDocument();
  });

  it('renders with custom className', () => {
    render(<PeriodSelector {...defaultProps} className="custom-class" />);

    const container = screen.getByText('対象期間').closest('div');
    expect(container).toHaveClass('custom-class');
  });

  it('can be disabled', () => {
    render(<PeriodSelector {...defaultProps} disabled />);

    // Check that individual toggle items are disabled
    const items = screen.getAllByRole('radio');
    items.forEach((item) => {
      expect(item).toBeDisabled();
    });
  });

  it('has proper aria labels for accessibility', () => {
    render(<PeriodSelector {...defaultProps} />);

    expect(screen.getByRole('radio', { name: '3ヶ月' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '6ヶ月' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '12ヶ月' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '全期間' })).toBeInTheDocument();
  });
});
