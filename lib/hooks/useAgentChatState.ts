'use client';

import { useCallback, useReducer } from 'react';
import type {
  AgentAssistantMessage,
  AgentChatState,
  AgentMessage,
  AgentSystemMessage,
  AgentUserMessage,
  ChatAction,
  MessageSource,
} from '@/types/agent-chat';
import type { AgentSearchError } from '@/lib/hooks/useAgentSearch';
import { generateId } from '@/lib/utils/id';

export const DEFAULT_PERSONA_ID = 'default';

export interface CreateInitialStateOptions {
  personaId?: string;
  transcriptId?: string;
  messages?: AgentMessage[];
  activeRequestId?: string | null;
  error?: AgentSearchError;
}

export interface UseAgentChatStateOptions {
  personaId?: string;
  transcriptId?: string;
  initialMessages?: AgentMessage[];
  activeRequestId?: string | null;
  error?: AgentSearchError;
}

export interface UseAgentChatStateReturn {
  state: AgentChatState;
  addUserMessage: (content: string, queryId: string) => void;
  startAssistant: (id: string, requestId: string) => void;
  patchAssistant: (id: string, delta: string) => void;
  completeAssistant: (params: CompleteAssistantMessageParams) => void;
  errorAssistant: (id: string, error: AgentSearchError) => void;
  addSystemMessage: (
    content: string,
    messageType: AgentSystemMessage['type'],
    requestId?: string
  ) => void;
  setChatError: (error: AgentSearchError) => void;
  reset: (options?: { preservePersona?: boolean } | boolean) => void;
}

type CompleteAssistantMessageParams = {
  id: string;
  content: string;
  source: MessageSource;
  usage?: AgentAssistantMessage['usage'];
  articles?: AgentAssistantMessage['articles'];
};

type UseAgentChatStateArgument = string | UseAgentChatStateOptions | undefined;

const makeEmptyUserMessageError = (): AgentSearchError => ({
  status: 400,
  message: 'User message content cannot be empty',
});

const cloneMessages = (messages?: AgentMessage[]): AgentMessage[] =>
  messages ? [...messages] : [];

const isTerminalStatus = (status: AgentAssistantMessage['status']): boolean =>
  status === 'complete' || status === 'error';

export function createInitialState(
  options?: CreateInitialStateOptions
): AgentChatState {
  return {
    transcriptId: options?.transcriptId ?? generateId(),
    personaId: options?.personaId ?? DEFAULT_PERSONA_ID,
    messages: cloneMessages(options?.messages),
    activeRequestId: options?.activeRequestId ?? null,
    error: options?.error,
  };
}

export function chatReducer(
  state: AgentChatState,
  action: ChatAction
): AgentChatState {
  switch (action.type) {
    case 'userMessage': {
      const trimmedContent = action.content.trim();

      if (!trimmedContent) {
        return {
          ...state,
          error: makeEmptyUserMessageError(),
        };
      }

      const userMessage: AgentUserMessage = {
        id: generateId(),
        role: 'user',
        content: trimmedContent,
        createdAt: Date.now(),
        queryId: action.queryId,
      };

      return {
        ...state,
        messages: [...state.messages, userMessage],
        error: undefined,
      };
    }

    case 'assistantStart': {
      const assistantMessage: AgentAssistantMessage = {
        id: action.id,
        role: 'assistant',
        content: '',
        partialContent: '',
        status: 'typing',
        requestId: action.requestId,
        source: 'live',
        createdAt: Date.now(),
      };

      return {
        ...state,
        activeRequestId: action.requestId,
        messages: [...state.messages, assistantMessage],
      };
    }

    case 'assistantPatch': {
      let updated = false;

      const messages = state.messages.map((message) => {
        if (message.role !== 'assistant' || message.id !== action.id) {
          return message;
        }

        if (isTerminalStatus(message.status)) {
          return message;
        }

        updated = true;

        return {
          ...message,
          partialContent: `${message.partialContent ?? ''}${action.delta}`,
          status: 'streaming' as const,
        };
      });

      return updated ? { ...state, messages } : state;
    }

    case 'assistantComplete': {
      let updated = false;

      const messages = state.messages.map((message) => {
        if (message.role !== 'assistant' || message.id !== action.id) {
          return message;
        }

        updated = true;

        return {
          ...message,
          content: action.content,
          partialContent: undefined,
          status: 'complete' as const,
          source: action.source,
          usage: action.usage,
          articles: action.articles,
          error: undefined,
        };
      });

      return updated
        ? { ...state, activeRequestId: null, messages }
        : { ...state, activeRequestId: null };
    }

    case 'assistantError': {
      let updated = false;

      const messages = state.messages.map((message) => {
        if (message.role !== 'assistant' || message.id !== action.id) {
          return message;
        }

        updated = true;

        return {
          ...message,
          status: 'error' as const,
          error: action.error,
        };
      });

      return updated
        ? { ...state, activeRequestId: null, messages }
        : { ...state, activeRequestId: null };
    }

    case 'systemMessage': {
      const systemMessage: AgentSystemMessage = {
        id: generateId(),
        role: 'system',
        content: action.content,
        type: action.messageType,
        requestId: action.requestId,
        createdAt: Date.now(),
      };

      return {
        ...state,
        messages: [...state.messages, systemMessage],
      };
    }

    case 'chatError':
      return {
        ...state,
        activeRequestId: null,
        error: action.error,
      };

    case 'reset': {
      const nextPersonaId = action.preservePersona
        ? state.personaId
        : DEFAULT_PERSONA_ID;
      return createInitialState({ personaId: nextPersonaId });
    }

    default:
      return state;
  }
}

export function useAgentChatState(personaId?: string): UseAgentChatStateReturn;
export function useAgentChatState(
  options?: UseAgentChatStateOptions
): UseAgentChatStateReturn;
export function useAgentChatState(
  arg?: UseAgentChatStateArgument
): UseAgentChatStateReturn {
  const normalizedOptions: UseAgentChatStateOptions =
    typeof arg === 'string' || typeof arg === 'undefined'
      ? { personaId: arg }
      : (arg ?? {});

  const [state, dispatch] = useReducer(chatReducer, undefined, () =>
    createInitialState({
      personaId: normalizedOptions.personaId,
      transcriptId: normalizedOptions.transcriptId,
      messages: normalizedOptions.initialMessages,
      activeRequestId: normalizedOptions.activeRequestId,
      error: normalizedOptions.error,
    })
  );

  const addUserMessage = useCallback(
    (content: string, queryId: string) => {
      dispatch({ type: 'userMessage', content, queryId });
    },
    [dispatch]
  );

  const startAssistant = useCallback(
    (id: string, requestId: string) => {
      dispatch({ type: 'assistantStart', id, requestId });
    },
    [dispatch]
  );

  const patchAssistant = useCallback(
    (id: string, delta: string) => {
      dispatch({ type: 'assistantPatch', id, delta });
    },
    [dispatch]
  );

  const completeAssistant = useCallback(
    (params: CompleteAssistantMessageParams) => {
      dispatch({
        type: 'assistantComplete',
        id: params.id,
        content: params.content,
        source: params.source,
        usage: params.usage,
        articles: params.articles,
      });
    },
    [dispatch]
  );

  const errorAssistant = useCallback(
    (id: string, error: AgentSearchError) => {
      dispatch({ type: 'assistantError', id, error });
    },
    [dispatch]
  );

  const addSystemMessage = useCallback(
    (
      content: string,
      messageType: AgentSystemMessage['type'],
      requestId?: string
    ) => {
      dispatch({ type: 'systemMessage', content, messageType, requestId });
    },
    [dispatch]
  );

  const setChatError = useCallback(
    (error: AgentSearchError) => {
      dispatch({ type: 'chatError', error });
    },
    [dispatch]
  );

  const reset = useCallback(
    (input?: { preservePersona?: boolean } | boolean) => {
      const preservePersona =
        typeof input === 'boolean' ? input : input?.preservePersona;
      dispatch({ type: 'reset', preservePersona });
    },
    [dispatch]
  );

  return {
    state,
    addUserMessage,
    startAssistant,
    patchAssistant,
    completeAssistant,
    errorAssistant,
    addSystemMessage,
    setChatError,
    reset,
  };
}
