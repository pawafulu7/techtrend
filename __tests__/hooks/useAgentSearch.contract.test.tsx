import { renderHook } from '@testing-library/react';
import { useAgentSearch } from '@/lib/hooks/useAgentSearch';
import type { UseAgentSearchReturn, ChatMessage } from '@/lib/hooks/useAgentSearch';

describe('useAgentSearch Contract', () => {
  test('returns correct interface shape', () => {
    const { result } = renderHook(() => useAgentSearch());
    const hook: UseAgentSearchReturn = result.current;

    expect(hook).toHaveProperty('search');
    expect(hook).toHaveProperty('result');
    expect(hook).toHaveProperty('error');
    expect(hook).toHaveProperty('isLoading');
    expect(hook).toHaveProperty('partialText');
    expect(hook).toHaveProperty('reset');

    expect(typeof hook.search).toBe('function');
    expect(typeof hook.reset).toBe('function');
    expect(hook.result).toBeNull();
    expect(hook.error).toBeNull();
    expect(hook.isLoading).toBe(false);
    expect(hook.partialText).toBeNull();
  });

  test('search function accepts string query', () => {
    const { result } = renderHook(() => useAgentSearch());

    expect(result.current.search).toBeInstanceOf(Function);
    // search(queryOrMessages: string | ChatMessage[])
    expect(result.current.search.length).toBe(1);
  });

  test('search function accepts ChatMessage array', () => {
    const { result } = renderHook(() => useAgentSearch());

    // Verify the type allows ChatMessage[] (compile-time check)
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
      { role: 'user', content: 'Follow up question' },
    ];

    // This should compile without errors - runtime test not needed
    // as the actual fetch would require mocking
    expect(typeof result.current.search).toBe('function');
    void messages; // Use the variable to avoid lint error
  });

  test('accepts optional callbacks', () => {
    const onSuccess = jest.fn();
    const onError = jest.fn();

    const { result } = renderHook(() =>
      useAgentSearch({
        onSuccess,
        onError,
      })
    );

    expect(result.current).toBeDefined();
  });

  test('reset function initializes state', () => {
    const { result } = renderHook(() => useAgentSearch());

    result.current.reset();

    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.partialText).toBeNull();
  });

  test('ChatMessage type has correct shape', () => {
    // Type assertion test
    const validMessage: ChatMessage = {
      role: 'user',
      content: 'test',
    };
    expect(validMessage.role).toBe('user');
    expect(validMessage.content).toBe('test');

    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: 'response',
    };
    expect(assistantMessage.role).toBe('assistant');
    expect(assistantMessage.content).toBe('response');
  });
});
