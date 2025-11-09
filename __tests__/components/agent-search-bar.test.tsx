import { render, screen, fireEvent } from '@testing-library/react';
import { AgentSearchBar } from '@/app/search/agent/_components/agent-search-bar';

const mockSaveToHistory = jest.fn();
const mockGetSearchHistory = jest.fn(() => ['query 1', 'query 2']);
const mockClearHistory = jest.fn();

jest.mock('@/lib/hooks/useSearchHistory', () => ({
  useSearchHistory: () => ({
    getSearchHistory: mockGetSearchHistory,
    saveToHistory: mockSaveToHistory,
    clearHistory: mockClearHistory,
  }),
}));

describe('AgentSearchBar', () => {
  const mockOnSearch = jest.fn();

  beforeEach(() => {
    mockOnSearch.mockClear();
    mockSaveToHistory.mockClear();
    mockGetSearchHistory.mockClear();
    mockClearHistory.mockClear();
  });

  test('renders with AI search badge', () => {
    render(<AgentSearchBar onSearch={mockOnSearch} />);
    expect(screen.getByText('AI検索')).toBeInTheDocument();
    expect(screen.getByText('自然言語で記事を検索できます')).toBeInTheDocument();
  });

  test('calls onSearch with query on Enter key', () => {
    render(<AgentSearchBar onSearch={mockOnSearch} />);

    const input = screen.getByLabelText('AI検索クエリ入力');
    fireEvent.change(input, { target: { value: 'test query' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mockOnSearch).toHaveBeenCalledWith('test query');
  });

  test('shows loading state when isLoading=true', () => {
    render(<AgentSearchBar onSearch={mockOnSearch} isLoading />);
    expect(screen.getByText('検索中')).toBeInTheDocument();
    const searchButton = screen.getByRole('button', { name: '検索中' });
    expect(searchButton).toBeInTheDocument();
  });

  test('clears input on X button click', () => {
    render(<AgentSearchBar onSearch={mockOnSearch} />);

    const input = screen.getByLabelText('AI検索クエリ入力') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'test' } });
    expect(input.value).toBe('test');

    const clearButton = screen.getByLabelText('クリア');
    fireEvent.click(clearButton);
    expect(input.value).toBe('');
  });

  test('displays search history suggestions on focus', () => {
    render(<AgentSearchBar onSearch={mockOnSearch} />);
    const input = screen.getByLabelText('AI検索クエリ入力');
    fireEvent.focus(input);

    expect(screen.getByText('query 1')).toBeInTheDocument();
    expect(screen.getByText('query 2')).toBeInTheDocument();
    expect(screen.getByText('最近の検索')).toBeInTheDocument();
  });

  test('keyboard shortcut Cmd+Shift+K focuses input', () => {
    render(<AgentSearchBar onSearch={mockOnSearch} />);
    const input = screen.getByLabelText('AI検索クエリ入力');

    fireEvent.keyDown(document, { metaKey: true, shiftKey: true, key: 'K' });
    expect(input).toHaveFocus();
  });

  test('disables input and button when isLoading=true', () => {
    render(<AgentSearchBar onSearch={mockOnSearch} isLoading />);

    const input = screen.getByLabelText('AI検索クエリ入力');
    const searchButton = screen.getByRole('button', { name: '検索中' });

    expect(input).toBeDisabled();
    expect(searchButton).toBeDisabled();
  });

  test('search button disabled when query is empty', () => {
    render(<AgentSearchBar onSearch={mockOnSearch} />);

    const searchButton = screen.getByRole('button', { name: '検索' });
    expect(searchButton).toBeDisabled();
  });

  test('does NOT call onSearch when clicking suggestion (allows editing)', () => {
    render(<AgentSearchBar onSearch={mockOnSearch} />);

    const input = screen.getByLabelText('AI検索クエリ入力');
    fireEvent.focus(input);

    const suggestion = screen.getByText('query 1');
    fireEvent.click(suggestion);

    // Verify search NOT triggered (user can edit before searching)
    expect(mockOnSearch).not.toHaveBeenCalled();
    expect(mockSaveToHistory).not.toHaveBeenCalled();

    // Verify input value set and focused
    expect(input).toHaveValue('query 1');
    expect(input).toHaveFocus();
  });

  test('renders initial query', () => {
    render(<AgentSearchBar onSearch={mockOnSearch} initialQuery="initial test" />);

    const input = screen.getByLabelText('AI検索クエリ入力') as HTMLInputElement;
    expect(input.value).toBe('initial test');
  });

  test('allows editing after history selection before search', () => {
    render(<AgentSearchBar onSearch={mockOnSearch} />);

    const input = screen.getByLabelText('AI検索クエリ入力');

    // 1. Focus input to show suggestions
    fireEvent.focus(input);

    // 2. Click history suggestion
    const suggestion = screen.getByText('query 1');
    fireEvent.click(suggestion);

    // 3. Verify input value set, NO search triggered
    expect(input).toHaveValue('query 1');
    expect(mockOnSearch).not.toHaveBeenCalled();
    expect(input).toHaveFocus();

    // 4. Edit the query
    fireEvent.change(input, { target: { value: 'query 1 edited' } });

    // 5. Press Enter
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    // 6. Verify search called with edited query
    expect(mockOnSearch).toHaveBeenCalledWith('query 1 edited');
    expect(mockOnSearch).toHaveBeenCalledTimes(1);
  });
});
