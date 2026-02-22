/**
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { useAgentChatState, DEFAULT_PERSONA_ID } from '@/lib/hooks/useAgentChatState';

describe('useAgentChatState', () => {
  describe('Batch 1: Initialization', () => {
    test('initializes with empty messages', () => {
      const { result } = renderHook(() => useAgentChatState());

      const { state } = result.current;
      expect(state.transcriptId).toEqual(expect.any(String));
      expect(state.transcriptId.length).toBeGreaterThan(0);
      expect(state.personaId).toBe(DEFAULT_PERSONA_ID);
      expect(state.messages).toEqual([]);
      expect(state.activeRequestId).toBeNull();
      expect(state.error).toBeUndefined();
    });

    test('addUserMessage appends user message', () => {
      const { result } = renderHook(() => useAgentChatState());

      act(() => {
        result.current.addUserMessage('Hello Agent', 'query-1');
      });

      const [message] = result.current.state.messages;
      expect(result.current.state.messages).toHaveLength(1);
      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello Agent');
      expect(message.queryId).toBe('query-1');
      expect(message.id).toEqual(expect.any(String));
      expect(message.createdAt).toEqual(expect.any(Number));
    });
  });

  describe('Batch 2: Assistant Streaming', () => {
    test('startAssistant adds assistant message with typing status', () => {
      const { result } = renderHook(() => useAgentChatState());

      act(() => {
        result.current.startAssistant('asst-1', 'req-1');
      });

      const { messages, activeRequestId } = result.current.state;
      expect(messages).toHaveLength(1);
      expect(activeRequestId).toBe('req-1');

      const [assistant] = messages;
      expect(assistant.role).toBe('assistant');
      expect(assistant.id).toBe('asst-1');
      expect(assistant.requestId).toBe('req-1');
      expect(assistant.status).toBe('typing');
      expect(assistant.content).toBe('');
      expect(assistant.partialContent).toBe('');
      expect(assistant.source).toBe('live');
      expect(assistant.createdAt).toEqual(expect.any(Number));
    });

    test('patchAssistant appends delta to partialContent', () => {
      const { result } = renderHook(() => useAgentChatState());

      act(() => {
        result.current.startAssistant('asst-1', 'req-1');
      });

      act(() => {
        result.current.patchAssistant('asst-1', 'Hello');
      });

      let [assistant] = result.current.state.messages;
      expect(assistant.partialContent).toBe('Hello');
      expect(assistant.status).toBe('streaming');

      act(() => {
        result.current.patchAssistant('asst-1', ' World');
      });

      [assistant] = result.current.state.messages;
      expect(assistant.partialContent).toBe('Hello World');
    });
  });

  describe('Batch 3: Completion & Errors', () => {
    test('completeAssistant finalizes message content', () => {
      const { result } = renderHook(() => useAgentChatState());

      act(() => {
        result.current.startAssistant('asst-1', 'req-1');
        result.current.patchAssistant('asst-1', 'Hello ');
        result.current.patchAssistant('asst-1', 'World');
        result.current.completeAssistant({
          id: 'asst-1',
          content: 'Hello World',
          source: 'live',
          usage: { totalTokens: 123 },
        });
      });

      const { state } = result.current;
      expect(state.activeRequestId).toBeNull();
      const [assistant] = state.messages;
      expect(assistant.content).toBe('Hello World');
      expect(assistant.partialContent).toBeUndefined();
      expect(assistant.status).toBe('complete');
      expect(assistant.source).toBe('live');
      expect(assistant.usage?.totalTokens).toBe(123);
    });

    test('errorAssistant marks the message and setChatError stores chat-level error', () => {
      const { result } = renderHook(() => useAgentChatState());
      const messageError = { status: 500, message: 'Streaming failed' };
      const chatError = { status: 400, message: 'Chat unavailable' };

      act(() => {
        result.current.startAssistant('asst-1', 'req-1');
        result.current.patchAssistant('asst-1', 'Partial');
        result.current.errorAssistant('asst-1', messageError);
      });

      const assistant = result.current.state.messages[0];
      expect(result.current.state.activeRequestId).toBeNull();
      expect(assistant.status).toBe('error');
      expect(assistant.error).toEqual(messageError);
      expect(assistant.partialContent).toBe('Partial');

      act(() => {
        result.current.setChatError(chatError);
      });

      expect(result.current.state.error).toEqual(chatError);
      expect(result.current.state.activeRequestId).toBeNull();
    });
  });

  describe('Batch 4: Reset', () => {
    test('reset regenerates transcriptId and clears chat state', () => {
      const { result } = renderHook(() => useAgentChatState());
      const originalTranscriptId = result.current.state.transcriptId;

      act(() => {
        result.current.addUserMessage('First question', 'q-1');
        result.current.startAssistant('asst-1', 'req-1');
        result.current.reset();
      });

      const { state } = result.current;
      expect(state.transcriptId).not.toBe(originalTranscriptId);
      expect(state.messages).toEqual([]);
      expect(state.personaId).toBe(DEFAULT_PERSONA_ID);
      expect(state.activeRequestId).toBeNull();
    });

    test('reset(true) preserves a custom personaId', () => {
      const { result } = renderHook(() => useAgentChatState('custom-persona'));

      act(() => {
        result.current.reset(true);
      });

      expect(result.current.state.personaId).toBe('custom-persona');
      expect(result.current.state.messages).toEqual([]);
    });
  });

  describe('Batch 5: Concurrency & Unknown IDs', () => {
    test('handles multiple concurrent assistant messages', () => {
      const { result } = renderHook(() => useAgentChatState());

      act(() => {
        result.current.startAssistant('asst-1', 'req-1');
        result.current.startAssistant('asst-2', 'req-2');
      });

      expect(result.current.state.messages).toHaveLength(2);

      act(() => {
        result.current.patchAssistant('asst-1', 'Hello from 1');
        result.current.patchAssistant('asst-2', 'Hello from 2');
      });

      const first = result.current.state.messages.find((msg) => msg.id === 'asst-1');
      const second = result.current.state.messages.find((msg) => msg.id === 'asst-2');
      expect(first?.partialContent).toBe('Hello from 1');
      expect(second?.partialContent).toBe('Hello from 2');
    });

    test('assistantPatch ignores unknown IDs and system messages append correctly', () => {
      const { result } = renderHook(() => useAgentChatState());

      act(() => {
        result.current.startAssistant('asst-1', 'req-1');
        result.current.addSystemMessage('Cache hit', 'cache-hit', 'req-1');
      });

      const systemMessage = result.current.state.messages.find((msg) => msg.role === 'system');
      expect(systemMessage).toBeDefined();
      expect(systemMessage?.type).toBe('cache-hit');
      expect(systemMessage?.requestId).toBe('req-1');

      const snapshot = result.current.state;

      act(() => {
        result.current.patchAssistant('unknown-id', 'Should be ignored');
      });

      expect(result.current.state).toBe(snapshot);
    });
  });

  describe('Batch 6: Enhanced Edge Cases', () => {
    test('multiple deltas append correctly', () => {
      const { result } = renderHook(() => useAgentChatState());

      act(() => {
        result.current.startAssistant('asst-1', 'req-1');
        result.current.patchAssistant('asst-1', 'A');
        result.current.patchAssistant('asst-1', 'B');
        result.current.patchAssistant('asst-1', 'C');
      });

      const assistant = result.current.state.messages[0];
      expect(assistant.partialContent).toBe('ABC');
    });

    test('patch after complete is ignored', () => {
      const { result } = renderHook(() => useAgentChatState());

      act(() => {
        result.current.startAssistant('asst-1', 'req-1');
        result.current.patchAssistant('asst-1', 'Hello');
        result.current.completeAssistant({ id: 'asst-1', content: 'Done', source: 'live' });
      });

      const before = result.current.state.messages[0];

      act(() => {
        result.current.patchAssistant('asst-1', 'Late delta');
      });

      expect(result.current.state.messages[0]).toBe(before);
    });

    test('errorAssistant preserves partialContent on failure', () => {
      const { result } = renderHook(() => useAgentChatState());

      act(() => {
        result.current.startAssistant('asst-1', 'req-1');
        result.current.patchAssistant('asst-1', 'Partial text');
        result.current.errorAssistant('asst-1', { status: 500, message: 'Failure' });
      });

      const assistant = result.current.state.messages[0];
      expect(assistant.status).toBe('error');
      expect(assistant.partialContent).toBe('Partial text');
    });

    test('reset clears activeRequestId mid-stream', () => {
      const { result } = renderHook(() => useAgentChatState());

      act(() => {
        result.current.startAssistant('asst-1', 'req-1');
      });

      expect(result.current.state.activeRequestId).toBe('req-1');

      act(() => {
        result.current.reset();
      });

      expect(result.current.state.activeRequestId).toBeNull();
    });

    test('reset generates unique transcriptId on each call', () => {
      const { result } = renderHook(() => useAgentChatState());
      const id1 = result.current.state.transcriptId;

      act(() => {
        result.current.reset();
      });
      const id2 = result.current.state.transcriptId;

      act(() => {
        result.current.reset();
      });
      const id3 = result.current.state.transcriptId;

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
    });

    test('hook callbacks remain stable between rerenders', () => {
      const { result, rerender } = renderHook(() => useAgentChatState());

      const callbacksBefore = {
        addUserMessage: result.current.addUserMessage,
        startAssistant: result.current.startAssistant,
        reset: result.current.reset,
      };

      rerender();

      const callbacksAfter = {
        addUserMessage: result.current.addUserMessage,
        startAssistant: result.current.startAssistant,
        reset: result.current.reset,
      };

      expect(callbacksAfter.addUserMessage).toBe(callbacksBefore.addUserMessage);
      expect(callbacksAfter.startAssistant).toBe(callbacksBefore.startAssistant);
      expect(callbacksAfter.reset).toBe(callbacksBefore.reset);
    });
  });
});
