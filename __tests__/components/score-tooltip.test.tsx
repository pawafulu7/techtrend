import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ScoreTooltip } from '@/app/components/popular/score-tooltip';

// Note: Radix Tooltip uses pointer events which are hard to simulate in JSDOM
// We test the component rendering and structure, not the hover interaction itself

describe('ScoreTooltip', () => {
  const defaultProps = {
    score: 1234,
    bookmarks: 567,
    votes: 89,
    qualityScore: 95.5,
  };

  it('renders children correctly', () => {
    render(
      <ScoreTooltip {...defaultProps}>
        <span data-testid="trigger">Score: 1234</span>
      </ScoreTooltip>
    );

    expect(screen.getByTestId('trigger')).toBeInTheDocument();
    expect(screen.getByText('Score: 1234')).toBeInTheDocument();
  });

  it('renders trigger with cursor-help class', () => {
    render(
      <ScoreTooltip {...defaultProps}>
        <span>Hover me</span>
      </ScoreTooltip>
    );

    const trigger = screen.getByText('Hover me').parentElement;
    expect(trigger).toHaveClass('cursor-help');
  });

  it('applies custom className', () => {
    render(
      <ScoreTooltip {...defaultProps} className="custom-class">
        <span>Content</span>
      </ScoreTooltip>
    );

    const trigger = screen.getByText('Content').parentElement;
    expect(trigger).toHaveClass('custom-class');
  });
});

// Test the formatValue utility function behavior separately
describe('ScoreTooltip formatValue behavior', () => {
  it('handles valid numbers', () => {
    const { container } = render(
      <ScoreTooltip score={1234} bookmarks={567} votes={89} qualityScore={95.5}>
        <span>Test</span>
      </ScoreTooltip>
    );

    // The component should render without errors
    expect(container).toBeInTheDocument();
  });

  it('handles zero values', () => {
    const { container } = render(
      <ScoreTooltip score={0} bookmarks={0} votes={0} qualityScore={0}>
        <span>Test</span>
      </ScoreTooltip>
    );

    expect(container).toBeInTheDocument();
  });

  it('handles NaN values without crashing', () => {
    const { container } = render(
      <ScoreTooltip score={NaN} bookmarks={NaN} votes={NaN} qualityScore={NaN}>
        <span>Test</span>
      </ScoreTooltip>
    );

    expect(container).toBeInTheDocument();
  });
});
