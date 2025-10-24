import { render, screen, fireEvent } from '@testing-library/react';
import { AgentSearchBar } from '../agent-search-bar';

// Mock useSearchHistory hook
jest.mock('@/lib/hooks/useSearchHistory', () => ({
  useSearchHistory: () => ({
    getSearchHistory: jest.fn(() => ['past search query', 'another query']),
    saveToHistory: jest.fn(),
  }),
}));

describe('AgentSearchBar', () => {
  it('should not call onSearch when history suggestion is clicked', () => {
    const mockOnSearch = jest.fn();

    render(
      <AgentSearchBar
        onSearch={mockOnSearch}
        isLoading={false}
        disabled={false}
      />
    );

    // Focus input to show suggestions
    const input = screen.getByRole('textbox', { name: 'AI検索クエリ入力' });
    fireEvent.focus(input);

    // Find and click a suggestion
    const suggestion = screen.getByText('past search query');
    fireEvent.click(suggestion);

    // Verify onSearch was NOT called
    expect(mockOnSearch).not.toHaveBeenCalled();

    // Verify input value was set
    expect(input).toHaveValue('past search query');
  });

  it('should call onSearch when Enter key is pressed', () => {
    const mockOnSearch = jest.fn();

    render(
      <AgentSearchBar
        onSearch={mockOnSearch}
        isLoading={false}
        disabled={false}
      />
    );

    const input = screen.getByRole('textbox', { name: 'AI検索クエリ入力' });

    // Type query
    fireEvent.change(input, { target: { value: 'new search query' } });

    // Press Enter
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    // Verify onSearch was called with the query
    expect(mockOnSearch).toHaveBeenCalledWith('new search query');
    expect(mockOnSearch).toHaveBeenCalledTimes(1);
  });

  it('should call onSearch when search button is clicked', () => {
    const mockOnSearch = jest.fn();

    render(
      <AgentSearchBar
        onSearch={mockOnSearch}
        isLoading={false}
        disabled={false}
      />
    );

    const input = screen.getByRole('textbox', { name: 'AI検索クエリ入力' });

    // Type query
    fireEvent.change(input, { target: { value: 'button click search' } });

    // Click search button
    const searchButton = screen.getByRole('button', { name: '検索' });
    fireEvent.click(searchButton);

    // Verify onSearch was called with the query
    expect(mockOnSearch).toHaveBeenCalledWith('button click search');
    expect(mockOnSearch).toHaveBeenCalledTimes(1);
  });

  it('should focus input after history suggestion is clicked', () => {
    const mockOnSearch = jest.fn();

    render(
      <AgentSearchBar
        onSearch={mockOnSearch}
        isLoading={false}
        disabled={false}
      />
    );

    const input = screen.getByRole('textbox', { name: 'AI検索クエリ入力' });

    // Focus input to show suggestions
    fireEvent.focus(input);

    // Click a suggestion
    const suggestion = screen.getByText('past search query');
    fireEvent.click(suggestion);

    // Verify input still has focus (for editing)
    expect(input).toHaveFocus();
  });

  it('should not call onSearch when query is empty', () => {
    const mockOnSearch = jest.fn();

    render(
      <AgentSearchBar
        onSearch={mockOnSearch}
        isLoading={false}
        disabled={false}
      />
    );

    const input = screen.getByRole('textbox', { name: 'AI検索クエリ入力' });

    // Press Enter with empty input
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    // Verify onSearch was NOT called
    expect(mockOnSearch).not.toHaveBeenCalled();
  });
});
