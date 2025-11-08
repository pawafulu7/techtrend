import type { ArticleLink } from '@/lib/types/article-link';
import type { AgentSearchError } from '@/lib/hooks/useAgentSearch';

// Enums
export type AgentRole = 'system' | 'user' | 'assistant';
export type MessageSource = 'live' | 'cache' | 'fallback';
export type AssistantStatus = 'typing' | 'streaming' | 'complete' | 'error';

// Base message interface
export interface AgentMessageBase {
  id: string;
  role: AgentRole;
  createdAt: number;
  personaId?: string; // For Phase 2
  expiresAt?: number; // For Step 2 (localStorage TTL)
}

// User message
export interface AgentUserMessage extends AgentMessageBase {
  role: 'user';
  content: string;
  queryId: string; // Request correlation ID
}

// Assistant message
export interface AgentAssistantMessage extends AgentMessageBase {
  role: 'assistant';
  content: string;
  partialContent?: string; // Streaming buffer (cleared on complete)
  status: AssistantStatus;
  requestId: string; // Correlation to user's queryId
  source: MessageSource;
  usage?: {
    totalTokens: number;
    promptTokens?: number;
    completionTokens?: number;
  };
  articles?: ArticleLink[];
  error?: AgentSearchError; // Per-message error
}

// System message
export interface AgentSystemMessage extends AgentMessageBase {
  role: 'system';
  content: string;
  type: 'cache-hit' | 'fallback' | 'error' | 'tool-result';
  requestId?: string; // Optional correlation
}

// Union type
export type AgentMessage =
  | AgentUserMessage
  | AgentAssistantMessage
  | AgentSystemMessage;

// Chat state
export interface AgentChatState {
  transcriptId: string; // Regenerated on reset
  personaId: string;
  messages: AgentMessage[];
  activeRequestId: string | null; // Current streaming request
  error?: AgentSearchError; // Chat-level error
}

// Reducer actions
export type ChatAction =
  | { type: 'userMessage'; content: string; queryId: string }
  | { type: 'assistantStart'; id: string; requestId: string }
  | { type: 'assistantPatch'; id: string; delta: string }
  | {
      type: 'assistantComplete';
      id: string;
      content: string;
      source: MessageSource;
      usage?: AgentAssistantMessage['usage'];
      articles?: ArticleLink[];
    }
  | { type: 'assistantError'; id: string; error: AgentSearchError }
  | {
      type: 'systemMessage';
      content: string;
      messageType: AgentSystemMessage['type'];
      requestId?: string;
    }
  | { type: 'chatError'; error: AgentSearchError }
  | { type: 'reset'; preservePersona?: boolean };
