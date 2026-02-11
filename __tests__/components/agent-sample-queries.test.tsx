import { render, screen, fireEvent } from '@testing-library/react';
import { AgentSampleQueries } from '@/app/search/agent/_components/agent-sample-queries';
import {
  SAMPLE_QUERIES,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
} from '@/app/search/agent/_data/sample-queries';

describe('AgentSampleQueries', () => {
  const mockOnSelectQuery = jest.fn();

  beforeEach(() => {
    mockOnSelectQuery.mockClear();
  });

  describe('カテゴリタイルグリッド表示（デフォルト）', () => {
    test('should render 5 category tiles', () => {
      render(<AgentSampleQueries onSelectQuery={mockOnSelectQuery} />);

      // カテゴリタイルが存在
      CATEGORY_ORDER.forEach((category) => {
        expect(
          screen.getByTestId(`category-tile-${category}`)
        ).toBeInTheDocument();
      });
    });

    test('should display category labels', () => {
      render(<AgentSampleQueries onSelectQuery={mockOnSelectQuery} />);

      expect(
        screen.getByText(CATEGORY_LABELS.infrastructure)
      ).toBeInTheDocument();
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
        expect(tile.getAttribute('aria-label')).toContain(
          `${categoryLabel}カテゴリで検索`
        );
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
    const customQueries = [
      'カスタムクエリ1',
      'カスタムクエリ2',
      'カスタムクエリ3',
    ];

    test('should render custom queries when queries prop is provided', () => {
      render(
        <AgentSampleQueries
          onSelectQuery={mockOnSelectQuery}
          queries={customQueries}
        />
      );

      customQueries.forEach((query) => {
        expect(screen.getByText(query)).toBeInTheDocument();
      });
    });

    test('should call onSelectQuery when custom query button is clicked', () => {
      render(
        <AgentSampleQueries
          onSelectQuery={mockOnSelectQuery}
          queries={customQueries}
        />
      );

      const button = screen.getByRole('button', { name: customQueries[0] });
      fireEvent.click(button);

      expect(mockOnSelectQuery).toHaveBeenCalledWith(customQueries[0]);
    });

    test('should not render category tiles when queries prop is provided', () => {
      render(
        <AgentSampleQueries
          onSelectQuery={mockOnSelectQuery}
          queries={customQueries}
        />
      );

      // カテゴリタイルは存在しない
      CATEGORY_ORDER.forEach((category) => {
        expect(
          screen.queryByTestId(`category-tile-${category}`)
        ).not.toBeInTheDocument();
      });
    });
  });

  describe('サイドバーレイアウト表示（アコーディオン）', () => {
    test('should render sidebar layout when layout="sidebar"', () => {
      render(
        <AgentSampleQueries
          onSelectQuery={mockOnSelectQuery}
          layout="sidebar"
        />
      );

      CATEGORY_ORDER.forEach((category) => {
        expect(
          screen.getByTestId(`category-tile-${category}`)
        ).toBeInTheDocument();
      });

      expect(
        screen.getByRole('heading', { level: 2, name: 'カテゴリから探す' })
      ).toBeInTheDocument();
    });

    test('should display category labels in sidebar layout', () => {
      render(
        <AgentSampleQueries
          onSelectQuery={mockOnSelectQuery}
          layout="sidebar"
        />
      );

      expect(
        screen.getByText(CATEGORY_LABELS.infrastructure)
      ).toBeInTheDocument();
      expect(screen.getByText(CATEGORY_LABELS.ai)).toBeInTheDocument();
      expect(screen.getByText(CATEGORY_LABELS.frontend)).toBeInTheDocument();
      expect(screen.getByText(CATEGORY_LABELS.backend)).toBeInTheDocument();
      expect(screen.getByText(CATEGORY_LABELS.security)).toBeInTheDocument();
    });

    test('should expand category and show queries when toggle is clicked', () => {
      render(
        <AgentSampleQueries
          onSelectQuery={mockOnSelectQuery}
          layout="sidebar"
        />
      );

      const firstCategory = CATEGORY_ORDER[0];
      const toggle = screen.getByTestId(`category-toggle-${firstCategory}`);

      // Initially collapsed
      expect(toggle).toHaveAttribute('aria-expanded', 'false');

      // Click to expand
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');

      // Category queries should now be visible
      const categoryQueries = SAMPLE_QUERIES.filter(
        (q) => q.category === firstCategory
      );
      categoryQueries.forEach((query, idx) => {
        expect(
          screen.getByTestId(`category-query-${firstCategory}-${idx}`)
        ).toBeInTheDocument();
      });
    });

    test('should collapse category when toggle is clicked again', () => {
      render(
        <AgentSampleQueries
          onSelectQuery={mockOnSelectQuery}
          layout="sidebar"
        />
      );

      const firstCategory = CATEGORY_ORDER[0];
      const toggle = screen.getByTestId(`category-toggle-${firstCategory}`);

      // Expand
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');

      // Collapse
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });

    test('should call onSelectQuery when a query button is clicked', () => {
      render(
        <AgentSampleQueries
          onSelectQuery={mockOnSelectQuery}
          layout="sidebar"
        />
      );

      const firstCategory = CATEGORY_ORDER[0];
      const toggle = screen.getByTestId(`category-toggle-${firstCategory}`);

      // Expand category
      fireEvent.click(toggle);

      // Click first query
      const queryButton = screen.getByTestId(
        `category-query-${firstCategory}-0`
      );
      fireEvent.click(queryButton);

      const expectedQuery = SAMPLE_QUERIES.find(
        (q) => q.category === firstCategory
      );
      expect(mockOnSelectQuery).toHaveBeenCalledWith(expectedQuery!.text);
    });

    test('should only expand one category at a time', () => {
      render(
        <AgentSampleQueries
          onSelectQuery={mockOnSelectQuery}
          layout="sidebar"
        />
      );

      const firstCategory = CATEGORY_ORDER[0];
      const secondCategory = CATEGORY_ORDER[1];
      const firstToggle = screen.getByTestId(
        `category-toggle-${firstCategory}`
      );
      const secondToggle = screen.getByTestId(
        `category-toggle-${secondCategory}`
      );

      // Expand first
      fireEvent.click(firstToggle);
      expect(firstToggle).toHaveAttribute('aria-expanded', 'true');

      // Expand second - first should collapse
      fireEvent.click(secondToggle);
      expect(firstToggle).toHaveAttribute('aria-expanded', 'false');
      expect(secondToggle).toHaveAttribute('aria-expanded', 'true');
    });
  });
});
