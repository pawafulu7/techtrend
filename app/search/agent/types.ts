/**
 * Type definitions for AI Search multi-turn conversation
 */

import type { AgentSearchError, AgentSearchResult } from '@/lib/hooks/useAgentSearch';

/**
 * Represents a single turn in a conversation
 *
 * A turn consists of a user query and the corresponding AI response.
 * Used to maintain conversation history in the UI.
 */
export type ConversationTurn = {
  /** Unique identifier for this turn (crypto.randomUUID()) */
  id: string;

  /** User's question/query text */
  query: string;

  /** AI response result (null while loading or on error) */
  result: AgentSearchResult | null;

  /** Error if the request failed (null on success) */
  error: AgentSearchError | null;

  /** Timestamp when the query was submitted */
  timestamp: Date;
};

/**
 * Chat message format for API communication
 *
 * Matches the API schema for multi-turn conversations.
 */
export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

/**
 * Maximum number of conversation turns to keep in history
 */
export const MAX_CONVERSATION_TURNS = 20;
