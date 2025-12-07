import { render, screen } from '@testing-library/react';
import { TranslationBadge } from '@/components/ui/translation-badge';

describe('TranslationBadge', () => {
  it('renders with correct text', () => {
    render(<TranslationBadge />);
    expect(screen.getByText('自動翻訳')).toBeInTheDocument();
  });

  it('has correct aria-label for accessibility', () => {
    render(<TranslationBadge />);
    const badge = screen.getByLabelText('この記事は英語から自動翻訳されています');
    expect(badge).toBeInTheDocument();
  });

  it('has correct title attribute for tooltip', () => {
    render(<TranslationBadge />);
    const badge = screen.getByTitle('この記事は英語から自動翻訳されています');
    expect(badge).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<TranslationBadge className="custom-class" />);
    const badge = screen.getByText('自動翻訳');
    expect(badge).toHaveClass('custom-class');
  });

  it('passes through additional props', () => {
    render(<TranslationBadge data-testid="test-badge" />);
    expect(screen.getByTestId('test-badge')).toBeInTheDocument();
  });

  it('has correct styling for light mode', () => {
    render(<TranslationBadge />);
    const badge = screen.getByText('自動翻訳');
    // Check for blue color classes
    expect(badge).toHaveClass('bg-blue-50');
    expect(badge).toHaveClass('text-blue-700');
    expect(badge).toHaveClass('border-blue-200');
  });

  it('has dark mode classes', () => {
    render(<TranslationBadge />);
    const badge = screen.getByText('自動翻訳');
    // Check for dark mode classes
    expect(badge).toHaveClass('dark:bg-blue-950');
    expect(badge).toHaveClass('dark:text-blue-400');
    expect(badge).toHaveClass('dark:border-blue-800');
  });
});
