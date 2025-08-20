/**
 * チャット機能のカスタムフック
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ChatMessage, ChatState } from './types';
import {
  generateSessionId,
  loadMessagesFromStorage,
  saveMessagesToStorage,
  createMessage,
  getFixedResponse,
  isSearchQuery,
  extractSearchKeywords
} from './utils';

/**
 * チャット状態を管理するカスタムフック
 */
export function useChatState() {
  const [sessionId] = useState(() => generateSessionId());
  const [state, setState] = useState<ChatState>({
    messages: [],
    isOpen: false,
    isLoading: false
  });

  // メッセージをストレージから読み込み
  useEffect(() => {
    const savedMessages = loadMessagesFromStorage(sessionId);
    if (savedMessages.length > 0) {
      setState(prev => ({ ...prev, messages: savedMessages }));
    }
  }, [sessionId]);

  // メッセージが更新されたらストレージに保存
  useEffect(() => {
    if (state.messages.length > 0) {
      saveMessagesToStorage(sessionId, state.messages);
    }
  }, [sessionId, state.messages]);

  /**
   * チャットの開閉を切り替え
   */
  const toggleChat = useCallback(() => {
    setState(prev => ({ ...prev, isOpen: !prev.isOpen }));
  }, []);

  /**
   * メッセージをクリア
   */
  const clearMessages = useCallback(() => {
    setState(prev => ({ ...prev, messages: [] }));
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(`chat-messages-${sessionId}`);
    }
  }, [sessionId]);

  /**
   * メッセージを送信
   */
  const sendMessage = useCallback(async (content: string) => {
    // ユーザーメッセージを追加
    const userMessage = createMessage(content, 'user');
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage],
      isLoading: true,
      error: undefined
    }));

    try {
      // 検索クエリかどうか判定
      if (isSearchQuery(content)) {
        const keywords = extractSearchKeywords(content);
        
        if (keywords.length > 0) {
          // 検索APIを呼び出し
          const searchParams = new URLSearchParams({
            search: keywords.join(' '),
            limit: '3'
          });
          
          const response = await fetch(`/api/articles?${searchParams}`);
          if (response.ok) {
            const data = await response.json();
            const articles = data.data?.items || [];
            
            const assistantMessage = createMessage(
              articles.length > 0
                ? `${keywords.join(', ')}に関する記事を${articles.length}件見つけました：`
                : `申し訳ありません。${keywords.join(', ')}に関する記事が見つかりませんでした。`,
              'assistant',
              {
                articles: articles.slice(0, 3),
                suggestedActions: articles.length > 0 
                  ? ['もっと見る', '他のキーワードで検索']
                  : ['他のキーワードで検索', 'ヘルプを見る']
              }
            );
            
            setState(prev => ({
              ...prev,
              messages: [...prev.messages, assistantMessage],
              isLoading: false
            }));
            return;
          }
        }
      }

      // 固定応答を取得
      const fixedResponse = getFixedResponse(content);
      const assistantMessage = createMessage(
        fixedResponse.response,
        'assistant',
        {
          suggestedActions: fixedResponse.suggestedActions
        }
      );

      // 少し遅延を入れて自然な感じに
      await new Promise(resolve => setTimeout(resolve, 500));

      setState(prev => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
        isLoading: false
      }));
    } catch (error) {
      console.error('Failed to send message:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'メッセージの送信に失敗しました'
      }));
    }
  }, [state.messages, sessionId]);

  return {
    state,
    sessionId,
    toggleChat,
    clearMessages,
    sendMessage
  };
}

/**
 * チャットボタンの未読カウントを管理するフック
 */
export function useUnreadCount(messages: ChatMessage[], isOpen: boolean) {
  const [unreadCount, setUnreadCount] = useState(0);
  const lastReadIndexRef = useRef(0);

  useEffect(() => {
    if (isOpen) {
      // チャットが開いているときは未読をリセット
      lastReadIndexRef.current = messages.length;
      setUnreadCount(0);
    } else {
      // チャットが閉じているときはアシスタントメッセージをカウント
      const newMessages = messages.slice(lastReadIndexRef.current);
      const unreadAssistantMessages = newMessages.filter(
        msg => msg.role === 'assistant'
      ).length;
      setUnreadCount(unreadAssistantMessages);
    }
  }, [messages, isOpen]);

  return unreadCount;
}

/**
 * オートスクロールを管理するフック
 */
export function useAutoScroll(
  ref: React.RefObject<HTMLDivElement>,
  dependencies: any[]
) {
  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, dependencies);
}

/**
 * キーボードショートカットを管理するフック
 */
export function useChatKeyboard(
  isOpen: boolean,
  toggleChat: () => void
) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + / でチャットを開閉
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        toggleChat();
      }
      
      // Escapeでチャットを閉じる
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        e.stopPropagation();
        toggleChat();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, toggleChat]);
}