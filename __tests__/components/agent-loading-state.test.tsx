import { render, screen } from '@testing-library/react';
import { AgentLoadingState } from '@/app/search/agent/_components/agent-loading-state';

describe('AgentLoadingState', () => {
  test('renders 3 typing dots', () => {
    render(<AgentLoadingState />);

    const dots = screen.getAllByTestId('typing-dot');
    expect(dots).toHaveLength(3);
  });

  test('typing dots have animate-bounce class', () => {
    render(<AgentLoadingState />);

    const dots = screen.getAllByTestId('typing-dot');
    dots.forEach(dot => {
      expect(dot).toHaveClass('animate-bounce');
    });
  });

  test('typing dots have correct animation delays', () => {
    render(<AgentLoadingState />);

    const dots = screen.getAllByTestId('typing-dot');
    expect(dots[0]).toHaveStyle({ animationDelay: '0ms' });
    expect(dots[1]).toHaveStyle({ animationDelay: '150ms' });
    expect(dots[2]).toHaveStyle({ animationDelay: '300ms' });
  });

  test('has correct ARIA attributes', () => {
    render(<AgentLoadingState />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-busy', 'true');
  });

  test('displays 6 skeleton lines', () => {
    const { container } = render(<AgentLoadingState />);

    const skeletonLines = container.querySelectorAll('.animate-pulse');
    expect(skeletonLines.length).toBeGreaterThanOrEqual(6);
  });

  test('displays loading message', () => {
    render(<AgentLoadingState />);

    expect(screen.getByText('AIが回答を生成中...')).toBeInTheDocument();
  });
});
