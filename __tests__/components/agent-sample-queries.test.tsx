import { render, screen, fireEvent } from '@testing-library/react';
import { AgentSampleQueries } from '@/app/search/agent/_components/agent-sample-queries';
import { SAMPLE_QUERIES, CATEGORY_LABELS, CATEGORY_ORDER } from '@/app/search/agent/_data/sample-queries';

describe('AgentSampleQueries', () => {
  const mockOnSelectQuery = jest.fn();

  beforeEach(() => {
    mockOnSelectQuery.mockClear();
  });

  describe('カテゴリタイルグリッド表示（デフォルト）', () => {
    test('should render 5 category tiles', () => {
      render(<AgentSampleQueries onSelectQuery={mockOnSelectQuery} />);

      // 5つのカテゴリタイルが存在
      CATEGORY_ORDER.forEach((category) => {
        expect(screen.getByTestId(`category-tile-${category}`)).toBeInTheDocument();
      });
    });

    test('should display category labels', () => {
      render(<AgentSampleQueries onSelectQuery={mockOnSelectQuery} />);

      expect(screen.getByText(CATEGORY_LABELS.infrastructure)).toBeInTheDocument();
      expect(screen.getByText(CATEGORY_LABELS.ai)).toBeInTheDocument();
      expect(screen.getByText(CATEGORY_LABELS.frontend)).toBeInTheDocument();
      expect(screen.getByText(CATEGORY_LABELS.backend)).toBeInTheDocument();
      expect(screen.getByText(CATEGORY_LABELS.security)).toBeInTheDocument();
    });

    test('should display first query text for each category', () => {
      render(<AgentSampleQueries onSelectQuery={mockOnSelectQuery} />);

      // 各カテゴリの最初のクエリが表示される
      const firstQueryByCategory = CATEGORY_ORDER.map((cat) =>
        SAMPLE_QUERIES.find((q) => q.category === cat)
      );

      firstQueryByCategory.forEach((query) => {
        if (query) {
          expect(screen.getByText(query.text)).toBeInTheDocument();
        }
      });
    });

    test('should call onSelectQuery when category tile is clicked', () => {
      render(<AgentSampleQueries onSelectQuery={mockOnSelectQuery} />);

      const firstQuery = SAMPLE_QUERIES[0]; // infrastructure category
      const tile = screen.getByTestId(`category-tile-${firstQuery.category}`);

      fireEvent.click(tile);

      expect(mockOnSelectQuery).toHaveBeenCalledWith(firstQuery.text);
      expect(mockOnSelectQuery).toHaveBeenCalledTimes(1);
    });

    test('should have proper aria-label for category tiles', () => {
      render(<AgentSampleQueries onSelectQuery={mockOnSelectQuery} />);

      CATEGORY_ORDER.forEach((category) => {
        const tile = screen.getByTestId(`category-tile-${category}`);
        const categoryLabel = CATEGORY_LABELS[category];
        expect(tile.getAttribute('aria-label')).toContain(`${categoryLabel}カテゴリで検索`);
      });
    });

    test('should support keyboard interaction (Enter and Space)', () => {
      render(<AgentSampleQueries onSelectQuery={mockOnSelectQuery} />);

      const firstQuery = SAMPLE_QUERIES[0];
      const tile = screen.getByTestId(`category-tile-${firstQuery.category}`);

      // Enterキーで選択
      fireEvent.keyDown(tile, { key: 'Enter' });
      expect(mockOnSelectQuery).toHaveBeenCalledWith(firstQuery.text);

      mockOnSelectQuery.mockClear();

      // Spaceキーで選択
      fireEvent.keyDown(tile, { key: ' ' });
      expect(mockOnSelectQuery).toHaveBeenCalledWith(firstQuery.text);
    });

    test('should have role="button" and tabIndex for accessibility', () => {
      render(<AgentSampleQueries onSelectQuery={mockOnSelectQuery} />);

      CATEGORY_ORDER.forEach((category) => {
        const tile = screen.getByTestId(`category-tile-${category}`);
        expect(tile).toHaveAttribute('role', 'button');
        expect(tile).toHaveAttribute('tabindex', '0');
      });
    });
  });

  describe('従来のqueries props表示', () => {
    const customQueries = ['カスタムクエリ1', 'カスタムクエリ2', 'カスタムクエリ3'];

    test('should render custom queries when queries prop is provided', () => {
      render(<AgentSampleQueries onSelectQuery={mockOnSelectQuery} queries={customQueries} />);

      customQueries.forEach((query) => {
        expect(screen.getByText(query)).toBeInTheDocument();
      });
    });

    test('should call onSelectQuery when custom query button is clicked', () => {
      render(<AgentSampleQueries onSelectQuery={mockOnSelectQuery} queries={customQueries} />);

      const button = screen.getByRole('button', { name: customQueries[0] });
      fireEvent.click(button);

      expect(mockOnSelectQuery).toHaveBeenCalledWith(customQueries[0]);
    });

    test('should not render category tiles when queries prop is provided', () => {
      render(<AgentSampleQueries onSelectQuery={mockOnSelectQuery} queries={customQueries} />);

      // カテゴリタイルは存在しない
      CATEGORY_ORDER.forEach((category) => {
        expect(screen.queryByTestId(`category-tile-${category}`)).not.toBeInTheDocument();
      });
    });
  });

  describe('サイドバーレイアウト表示', () => {
    test('should render sidebar layout when layout="sidebar"', () => {
      render(<AgentSampleQueries onSelectQuery={mockOnSelectQuery} layout="sidebar" />);

      // 5つのカテゴリタイルが存在
      CATEGORY_ORDER.forEach((category) => {
        expect(screen.getByTestId(`category-tile-${category}`)).toBeInTheDocument();
      });

      // 見出しが表示される
      expect(screen.getByRole('heading', { level: 2, name: 'カテゴリから探す' })).toBeInTheDocument();
    });

    test('should display category labels in sidebar layout', () => {
      render(<AgentSampleQueries onSelectQuery={mockOnSelectQuery} layout="sidebar" />);

      expect(screen.getByText(CATEGORY_LABELS.infrastructure)).toBeInTheDocument();
      expect(screen.getByText(CATEGORY_LABELS.ai)).toBeInTheDocument();
      expect(screen.getByText(CATEGORY_LABELS.frontend)).toBeInTheDocument();
      expect(screen.getByText(CATEGORY_LABELS.backend)).toBeInTheDocument();
      expect(screen.getByText(CATEGORY_LABELS.security)).toBeInTheDocument();
    });

    test('should call onSelectQuery when sidebar tile is clicked', () => {
      render(<AgentSampleQueries onSelectQuery={mockOnSelectQuery} layout="sidebar" />);

      const firstQuery = SAMPLE_QUERIES[0];
      const tile = screen.getByTestId(`category-tile-${firstQuery.category}`);

      fireEvent.click(tile);

      expect(mockOnSelectQuery).toHaveBeenCalledWith(firstQuery.text);
      expect(mockOnSelectQuery).toHaveBeenCalledTimes(1);
    });

    test('should support keyboard interaction in sidebar layout', () => {
      render(<AgentSampleQueries onSelectQuery={mockOnSelectQuery} layout="sidebar" />);

      const firstQuery = SAMPLE_QUERIES[0];
      const tile = screen.getByTestId(`category-tile-${firstQuery.category}`);

      // Enterキーで選択
      fireEvent.keyDown(tile, { key: 'Enter' });
      expect(mockOnSelectQuery).toHaveBeenCalledWith(firstQuery.text);

      mockOnSelectQuery.mockClear();

      // Spaceキーで選択
      fireEvent.keyDown(tile, { key: ' ' });
      expect(mockOnSelectQuery).toHaveBeenCalledWith(firstQuery.text);
    });
  });
});
