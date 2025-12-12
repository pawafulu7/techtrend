import { render, screen } from '@testing-library/react';
import { AgentLoadingState } from '@/app/search/agent/_components/agent-loading-state';

describe('AgentLoadingState', () => {
  describe('Spinner rendering', () => {
    test('renders a spinner with correct animation', () => {
      const { container } = render(<AgentLoadingState />);
      const spinner = container.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    test('spinner supports reduced motion', () => {
      const { container } = render(<AgentLoadingState />);
      const spinner = container.querySelector('.animate-spin');
      expect(spinner).toHaveClass('motion-reduce:animate-none');
    });
  });

  describe('Accessibility', () => {
    test('has correct ARIA attributes', () => {
      render(<AgentLoadingState />);

      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('aria-live', 'polite');
      expect(status).toHaveAttribute('aria-busy', 'true');
    });

    test('spinner is hidden from screen readers', () => {
      const { container } = render(<AgentLoadingState />);
      const spinner = container.querySelector('.animate-spin');
      expect(spinner).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('CardV2 wrapper', () => {
    test('is wrapped in CardV2 ghost variant', () => {
      render(<AgentLoadingState />);

      const card = screen.getByTestId('agent-loading-state');
      expect(card).toBeInTheDocument();
      expect(card).toHaveClass('border-none', 'shadow-none');
    });
  });

  describe('Loading messages', () => {
    test('displays primary loading message', () => {
      render(<AgentLoadingState />);

      expect(screen.getByText('AIが回答を生成中...')).toBeInTheDocument();
    });

    test('displays secondary helper text', () => {
      render(<AgentLoadingState />);

      expect(screen.getByText('しばらくお待ちください')).toBeInTheDocument();
    });
  });

  describe('Custom className', () => {
    test('accepts and applies custom className', () => {
      render(<AgentLoadingState className="custom-class" />);

      const card = screen.getByTestId('agent-loading-state');
      expect(card).toHaveClass('custom-class');
    });
  });
});
