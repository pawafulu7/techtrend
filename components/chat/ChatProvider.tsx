'use client';

import React, { createContext, useContext } from 'react';
import { ChatContextType } from '@/lib/chat/types';
import { useChatState } from '@/lib/chat/hooks';

const ChatContext = createContext<ChatContextType | undefined>(undefined);

interface ChatProviderProps {
  children: React.ReactNode;
}

/**
 * チャット機能のプロバイダーコンポーネント
 * アプリケーション全体でチャット状態を共有する
 */
export function ChatProvider({ children }: ChatProviderProps) {
  const { state, toggleChat, clearMessages, sendMessage } = useChatState();

  const contextValue: ChatContextType = {
    state,
    toggleChat,
    clearMessages,
    sendMessage
  };

  return (
    <ChatContext.Provider value={contextValue}>
      {children}
    </ChatContext.Provider>
  );
}

/**
 * チャットコンテキストを使用するカスタムフック
 */
export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}

export default ChatProvider;