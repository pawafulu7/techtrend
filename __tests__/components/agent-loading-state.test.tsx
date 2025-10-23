import { render, screen, act } from '@testing-library/react';
import { AgentLoadingState } from '@/app/search/agent/_components/agent-loading-state';

describe('AgentLoadingState', () => {
  beforeEach(() => {
    jest.clearAllTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('renders with initial status message', () => {
    render(<AgentLoadingState />);
    expect(screen.getByText('AIが要約を生成中...')).toBeInTheDocument();
  });

  test('rotates status messages over time', () => {
    jest.useFakeTimers();
    render(<AgentLoadingState />);

    expect(screen.getByText('AIが要約を生成中...')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(3500);
    });

    expect(screen.getByText('関連資料を分析中...')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(3500);
    });

    expect(screen.getByText('結果をまとめています...')).toBeInTheDocument();

    jest.useRealTimers();
  });

  test('displays progress bar with correct attributes', () => {
    render(<AgentLoadingState />);

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    expect(progressBar).toHaveAttribute('aria-valuemax', '100');
  });

  test('has accessibility attributes', () => {
    render(<AgentLoadingState />);

    const container = screen.getByRole('status');
    expect(container).toHaveAttribute('aria-live', 'polite');
    expect(container).toHaveAttribute('aria-busy', 'true');
  });

  test('displays skeleton lines', () => {
    const { container } = render(<AgentLoadingState />);

    const skeletonLines = container.querySelectorAll('.animate-pulse');
    expect(skeletonLines.length).toBe(6);
  });
});
