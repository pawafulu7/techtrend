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
  it('should NOT call onSearch when history suggestion is clicked', () => {
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

    // Verify onSearch was NOT called (allows editing before search)
    expect(mockOnSearch).not.toHaveBeenCalled();

    // Verify input value was set
    expect(input).toHaveValue('past search query');

    // Verify input is focused for editing
    expect(input).toHaveFocus();
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

  it('should set input value when history suggestion is clicked', () => {
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

    // Verify input value was set and focused, but search was NOT triggered
    expect(input).toHaveValue('past search query');
    expect(input).toHaveFocus();
    expect(mockOnSearch).not.toHaveBeenCalled();
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

  it('should allow editing after history selection before search', () => {
    const mockOnSearch = jest.fn();

    render(
      <AgentSearchBar
        onSearch={mockOnSearch}
        isLoading={false}
        disabled={false}
      />
    );

    const input = screen.getByRole('textbox', { name: 'AI検索クエリ入力' });

    // 1. Focus input to show suggestions
    fireEvent.focus(input);

    // 2. Click history suggestion
    const suggestion = screen.getByText('past search query');
    fireEvent.click(suggestion);

    // 3. Verify input value set, NO search triggered
    expect(input).toHaveValue('past search query');
    expect(mockOnSearch).not.toHaveBeenCalled();
    expect(input).toHaveFocus();

    // 4. Edit the query
    fireEvent.change(input, { target: { value: 'past search query edited' } });

    // 5. Press Enter
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    // 6. Verify search called with edited query
    expect(mockOnSearch).toHaveBeenCalledWith('past search query edited');
    expect(mockOnSearch).toHaveBeenCalledTimes(1);
  });
});
