'use client';

import React from 'react';
import { ChatButton } from './ChatButton';
import { ChatWindow } from './ChatWindow';
import { useChat } from './ChatProvider';
import { useUnreadCount, useChatKeyboard } from '@/lib/chat/hooks';

/**
 * チャットエージェントのメインコンポーネント
 * ChatButtonとChatWindowを統合して管理
 */
export function ChatAgent() {
  const { state, toggleChat, clearMessages, sendMessage } = useChat();
  const unreadCount = useUnreadCount(state.messages, state.isOpen);
  
  // キーボードショートカットを有効化
  useChatKeyboard(state.isOpen, toggleChat);

  const handleSendMessage = async (message: string) => {
    await sendMessage(message);
  };

  return (
    <>
      {/* チャットボタン */}
      <ChatButton
        isOpen={state.isOpen}
        onClick={toggleChat}
        unreadCount={unreadCount}
      />

      {/* チャットウィンドウ */}
      <ChatWindow
        isOpen={state.isOpen}
        onClose={toggleChat}
        messages={state.messages}
        onSendMessage={handleSendMessage}
        onClearMessages={clearMessages}
        isLoading={state.isLoading}
      />
    </>
  );
}

export default ChatAgent;