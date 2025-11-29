import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TrendIndicator } from '@/app/components/popular/trend-indicator';

describe('TrendIndicator', () => {
  const trendCases = [
    {
      trend: 'up' as const,
      label: 'ranking up',
      colorClass: 'text-[var(--tt-color-positive)]',
      animated: false,
    },
    {
      trend: 'down' as const,
      label: 'ranking down',
      colorClass: 'text-[var(--tt-color-negative)]',
      animated: false,
    },
    {
      trend: 'stable' as const,
      label: 'ranking unchanged',
      colorClass: 'text-muted-foreground',
      animated: false,
    },
    {
      trend: 'new' as const,
      label: 'new entry',
      colorClass: 'text-[var(--tt-color-warning)]',
      animated: true,
    },
  ];

  it.each(trendCases)(
    'renders %s trend with correct accessibility and styles',
    ({ trend, label, colorClass, animated }) => {
      render(<TrendIndicator trend={trend} />);

      const wrapper = screen.getByRole('status', { name: label });
      expect(wrapper).toBeInTheDocument();

      const icon = wrapper.querySelector('svg');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveAttribute('aria-hidden', 'true');
      expect(icon).toHaveClass('h-4', 'w-4');
      expect(icon).toHaveClass(colorClass);

      if (animated) {
        expect(icon).toHaveClass(
          'motion-safe:animate-pulse',
          'motion-reduce:animate-none'
        );
      } else {
        expect(icon).not.toHaveClass(
          'motion-safe:animate-pulse',
          'motion-reduce:animate-none'
        );
      }
    }
  );

  it('applies custom className to the wrapper', () => {
    const { getByRole } = render(
      <TrendIndicator trend="up" className="custom-trend" />
    );
    expect(getByRole('status', { name: 'ranking up' })).toHaveClass('custom-trend');
  });
});
