import { render, screen } from '@testing-library/react';
import { TranslationBadge } from '@/components/ui/translation-badge';

describe('TranslationBadge', () => {
  it('renders with correct text', () => {
    render(<TranslationBadge />);
    expect(screen.getByText('自動翻訳')).toBeInTheDocument();
  });

  it('has correct aria-label for accessibility', () => {
    render(<TranslationBadge />);
    const badge = screen.getByLabelText(
      'この記事は英語から自動翻訳されています'
    );
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

  it('has correct styling using info design tokens', () => {
    render(<TranslationBadge />);
    const badge = screen.getByText('自動翻訳');
    // Issue #603: dark: prefix を持つ raw blue クラスから --tt-color-info-* に統合
    // (CSS 変数が light/dark を自動切替)
    expect(badge).toHaveClass('bg-[var(--tt-color-info-bg)]');
    expect(badge).toHaveClass('text-[var(--tt-color-info)]');
    expect(badge).toHaveClass('border-[var(--tt-color-info-border)]');
  });
});
