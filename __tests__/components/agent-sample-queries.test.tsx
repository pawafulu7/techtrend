import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentSampleQueries } from '@/app/search/agent/_components/agent-sample-queries';
import { SAMPLE_QUERIES, CATEGORY_LABELS } from '@/app/search/agent/_data/sample-queries';

describe('AgentSampleQueries', () => {
  const mockOnSelectQuery = jest.fn();

  beforeEach(() => {
    mockOnSelectQuery.mockClear();
  });

  test('should render all 10 sample queries', () => {
    render(<AgentSampleQueries onSelectQuery={mockOnSelectQuery} />);

    SAMPLE_QUERIES.forEach((query) => {
      expect(screen.getByText(query.text)).toBeInTheDocument();
    });
  });

  test('should group queries by 5 categories', () => {
    render(<AgentSampleQueries onSelectQuery={mockOnSelectQuery} />);

    expect(screen.getByText(CATEGORY_LABELS.infrastructure)).toBeInTheDocument();
    expect(screen.getByText(CATEGORY_LABELS.ai)).toBeInTheDocument();
    expect(screen.getByText(CATEGORY_LABELS.frontend)).toBeInTheDocument();
    expect(screen.getByText(CATEGORY_LABELS.backend)).toBeInTheDocument();
    expect(screen.getByText(CATEGORY_LABELS.security)).toBeInTheDocument();
  });

  test('should call onSelectQuery with correct text when chip clicked', () => {
    render(<AgentSampleQueries onSelectQuery={mockOnSelectQuery} />);

    const firstQuery = SAMPLE_QUERIES[0];
    const chip = screen.getByRole('button', { name: firstQuery.text });

    fireEvent.click(chip);

    expect(mockOnSelectQuery).toHaveBeenCalledWith(firstQuery.text);
    expect(mockOnSelectQuery).toHaveBeenCalledTimes(1);
  });

  test('should have proper aria-label for each chip', () => {
    render(<AgentSampleQueries onSelectQuery={mockOnSelectQuery} />);

    SAMPLE_QUERIES.forEach((query) => {
      const chip = screen.getByRole('button', { name: query.text });
      expect(chip).toHaveAttribute('aria-label', query.text);
    });
  });

  test('should render categories in CATEGORY_ORDER', () => {
    const { container } = render(
      <AgentSampleQueries onSelectQuery={mockOnSelectQuery} />
    );

    const categoryLabels = container.querySelectorAll('.text-xs.text-muted-foreground');
    const expectedOrder = ['インフラ', 'AI', 'フロントエンド', 'バックエンド', 'セキュリティ'];

    categoryLabels.forEach((label, index) => {
      if (index > 0) {
        expect(label.textContent).toBe(expectedOrder[index - 1]);
      }
    });
  });

  test('should support keyboard interaction (Enter and Space)', () => {
    render(<AgentSampleQueries onSelectQuery={mockOnSelectQuery} />);

    const firstQuery = SAMPLE_QUERIES[0];
    const chip = screen.getByRole('button', { name: firstQuery.text });

    fireEvent.keyDown(chip, { key: 'Enter' });
    fireEvent.click(chip);
    expect(mockOnSelectQuery).toHaveBeenCalledWith(firstQuery.text);

    mockOnSelectQuery.mockClear();

    fireEvent.keyDown(chip, { key: ' ' });
    fireEvent.click(chip);
    expect(mockOnSelectQuery).toHaveBeenCalledWith(firstQuery.text);
  });
});
