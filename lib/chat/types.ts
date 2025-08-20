/**
 * チャット機能の型定義
 */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  articles?: Article[];
  suggestedActions?: string[];
  isTyping?: boolean;
}

export interface ChatState {
  messages: ChatMessage[];
  isOpen: boolean;
  isLoading: boolean;
  error?: string;
}

export interface ChatContextType {
  state: ChatState;
  sendMessage: (message: string) => Promise<void>;
  toggleChat: () => void;
  clearMessages: () => void;
}

export interface Article {
  id: string;
  title: string;
  url: string;
  summary?: string;
  publishedAt: Date;
  source?: {
    name: string;
  };
  tags?: {
    name: string;
  }[];
}

export interface ChatRequest {
  message: string;
  context?: ChatMessage[];
  sessionId?: string;
}

export interface ChatResponse {
  response: string;
  articles?: Article[];
  suggestedActions?: string[];
  type: 'text' | 'articles' | 'help' | 'error';
}

export type MessageType = 'greeting' | 'help' | 'search' | 'general';

export interface FixedResponse {
  keywords: string[];
  response: string;
  type: MessageType;
  actions?: string[];
}