import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ShareButton } from '@/app/components/popular/share-button';

// Mock toast
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

describe('ShareButton', () => {
  const defaultProps = {
    url: 'https://example.com/article/123',
    title: 'Test Article Title',
  };

  it('renders share button with correct accessibility attributes', () => {
    render(<ShareButton {...defaultProps} />);

    const button = screen.getByRole('button', { name: 'Share article' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-label', 'Share article');
  });

  it('has correct touch target size (44x44px)', () => {
    render(<ShareButton {...defaultProps} />);

    const button = screen.getByRole('button', { name: 'Share article' });
    expect(button).toHaveClass('h-11', 'w-11');
  });

  it('applies custom className', () => {
    render(<ShareButton {...defaultProps} className="custom-share" />);

    const button = screen.getByRole('button', { name: 'Share article' });
    expect(button).toHaveClass('custom-share');
  });

  it('renders Share2 icon with aria-hidden', () => {
    render(<ShareButton {...defaultProps} />);

    const button = screen.getByRole('button', { name: 'Share article' });
    const svg = button.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('has focus-visible ring styles', () => {
    render(<ShareButton {...defaultProps} />);

    const button = screen.getByRole('button', { name: 'Share article' });
    expect(button).toHaveClass('focus-visible:ring-2');
  });
});
