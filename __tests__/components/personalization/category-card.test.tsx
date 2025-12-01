/**
 * CategoryCard Component Tests
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { CategoryCard, CategoryCardSkeleton } from '@/app/components/personalization/category-card';
import type { InterestCategoryWithCount } from '@/lib/personalization/types';

describe('CategoryCard', () => {
  const mockOnToggle = jest.fn();

  const mockCategory: InterestCategoryWithCount = {
    id: 'cat-1',
    slug: 'frontend',
    name: 'Frontend',
    description: 'Web UI development',
    icon: 'Monitor',
    sortOrder: 1,
    isActive: true,
  };

  const defaultProps = {
    category: mockCategory,
    selected: false,
    onToggle: mockOnToggle,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders category information', () => {
    render(<CategoryCard {...defaultProps} />);

    expect(screen.getByText('Frontend')).toBeInTheDocument();
    expect(screen.getByText('Web UI development')).toBeInTheDocument();
  });

  it('renders as checkbox role', () => {
    render(<CategoryCard {...defaultProps} />);

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
  });

  it('shows selected state', () => {
    render(<CategoryCard {...defaultProps} selected />);

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-checked', 'true');
    expect(checkbox).toHaveClass('border-primary');
  });

  it('calls onToggle when clicked', async () => {
    const user = userEvent.setup();
    render(<CategoryCard {...defaultProps} />);

    await user.click(screen.getByRole('checkbox'));

    expect(mockOnToggle).toHaveBeenCalledWith('cat-1');
  });

  it('calls onToggle when pressing Enter', async () => {
    const user = userEvent.setup();
    render(<CategoryCard {...defaultProps} />);

    const checkbox = screen.getByRole('checkbox');
    checkbox.focus();
    await user.keyboard('{Enter}');

    expect(mockOnToggle).toHaveBeenCalledWith('cat-1');
  });

  it('calls onToggle when pressing Space', async () => {
    const user = userEvent.setup();
    render(<CategoryCard {...defaultProps} />);

    const checkbox = screen.getByRole('checkbox');
    checkbox.focus();
    await user.keyboard(' ');

    expect(mockOnToggle).toHaveBeenCalledWith('cat-1');
  });

  it('does not call onToggle when disabled', async () => {
    const user = userEvent.setup();
    render(<CategoryCard {...defaultProps} disabled />);

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-disabled', 'true');

    await user.click(checkbox);

    expect(mockOnToggle).not.toHaveBeenCalled();
  });

  it('has correct test id', () => {
    render(<CategoryCard {...defaultProps} />);

    expect(screen.getByTestId('category-card-frontend')).toBeInTheDocument();
  });


  it('renders without description', () => {
    const categoryWithoutDescription = {
      ...mockCategory,
      description: null,
    };

    render(<CategoryCard {...defaultProps} category={categoryWithoutDescription} />);

    expect(screen.getByText('Frontend')).toBeInTheDocument();
    expect(screen.queryByText('Web UI development')).not.toBeInTheDocument();
  });
});

describe('CategoryCardSkeleton', () => {
  it('renders skeleton elements', () => {
    const { container } = render(<CategoryCardSkeleton />);

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });
});
