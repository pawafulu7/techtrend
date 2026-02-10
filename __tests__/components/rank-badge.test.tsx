import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RankBadge } from '@/app/components/popular/rank-badge';

describe('RankBadge', () => {
  const topThreeCases = [
    { rank: 1, colorClass: 'text-(--tt-color-rank-gold)' },
    { rank: 2, colorClass: 'text-(--tt-color-rank-silver)' },
    { rank: 3, colorClass: 'text-(--tt-color-rank-bronze)' },
  ] as const;

  it.each(topThreeCases)(
    'renders Award icon with correct color for rank %s',
    ({ rank, colorClass }) => {
      render(<RankBadge rank={rank} />);

      const badge = screen.getByRole('img', { name: `${rank}` });
      expect(badge).toBeInTheDocument();

      const icon = badge.querySelector('svg');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveAttribute('aria-hidden', 'true');
      expect(icon).toHaveClass('h-5', 'w-5');
      expect(icon).toHaveClass(colorClass);
    }
  );

  it('renders rank number for non-top-three ranks', () => {
    render(<RankBadge rank={4} />);

    const badge = screen.getByRole('img', { name: '4' });
    expect(badge).toBeInTheDocument();

    const number = screen.getByText('4');
    expect(number.tagName.toLowerCase()).toBe('span');
    expect(number).toHaveClass('text-lg', 'font-bold', 'text-foreground');
    expect(badge.querySelector('svg')).toBeNull();
  });

  it('applies custom className to the wrapper', () => {
    const { getByRole } = render(
      <RankBadge rank={2} className="custom-badge" />
    );
    expect(getByRole('img', { name: '2' })).toHaveClass('custom-badge');
  });
});
