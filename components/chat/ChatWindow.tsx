'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, Send, RotateCcw } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { MessageBubble } from './MessageBubble';
import { ChatMessage } from '@/lib/chat/types';
import { INITIAL_MESSAGE, QUICK_ACTIONS, CHAT_CONFIG } from '@/lib/chat/constants';
import { useMediaQuery } from '@/app/hooks/use-media-query';

interface ChatWindowProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  onClearMessages: () => void;
  isLoading?: boolean;
  className?: string;
}

/**
 * チャットウィンドウコンポーネント
 * メッセージの表示と入力フォームを含むメインのチャットインターフェース
 */
export function ChatWindow({
  isOpen,
  onClose,
  messages,
  onSendMessage,
  onClearMessages,
  isLoading = false,
  className
}: ChatWindowProps) {
  const [inputValue, setInputValue] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isMobile = useMediaQuery('(max-width: 768px)');

  // メッセージが追加されたら自動スクロール
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  // ウィンドウが開いたら入力フィールドにフォーカス
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSend = () => {
    if (inputValue.trim() && !isLoading) {
      onSendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleActionClick = (action: string) => {
    setInputValue(action);
    inputRef.current?.focus();
  };

  // 初期メッセージを含む全メッセージ
  const allMessages = messages.length === 0 
    ? [{
        id: 'initial',
        role: 'assistant' as const,
        content: INITIAL_MESSAGE,
        timestamp: new Date(),
        suggestedActions: QUICK_ACTIONS
      }]
    : messages;

  if (isMobile) {
    // モバイル版: フルスクリーン
    return (
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent 
          side="bottom" 
          className={cn(
            'h-full w-full p-0 flex flex-col',
            className
          )}
          data-testid="chat-window"
        >
          {/* ヘッダー */}
          <SheetHeader className="px-4 py-3 border-b">
            <div className="flex items-center justify-between">
              <SheetTitle>AIアシスタント</SheetTitle>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onClearMessages}
                  disabled={messages.length === 0}
                  aria-label="会話をクリア"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onClose}
                  aria-label="閉じる"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </SheetHeader>

          {/* メッセージエリア */}
          <div className="flex-1 px-4 py-4 overflow-y-auto" ref={scrollAreaRef}>
            {allMessages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onActionClick={handleActionClick}
              />
            ))}
            {isLoading && (
              <MessageBubble
                message={{
                  id: 'typing',
                  role: 'assistant',
                  content: '',
                  timestamp: new Date(),
                  isTyping: true
                }}
              />
            )}
          </div>

          {/* 入力エリア */}
          <div className="border-t p-4">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="メッセージを入力..."
                disabled={isLoading}
                maxLength={CHAT_CONFIG.message.maxLength}
                className="flex-1"
                data-testid="chat-input"
              />
              <Button
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading}
                size="icon"
                aria-label="送信"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <div className="text-xs text-muted-foreground mt-2 text-right">
              {inputValue.length}/{CHAT_CONFIG.message.maxLength}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // デスクトップ版: 部分表示
  return (
    <div
      className={cn(
        'fixed z-50 bg-background border rounded-xl shadow-xl flex flex-col',
        'transition-all duration-300',
        isOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0 pointer-events-none',
        className
      )}
      style={{
        bottom: CHAT_CONFIG.position.bottom,
        right: CHAT_CONFIG.position.right,
        width: CHAT_CONFIG.size.desktop.width,
        height: CHAT_CONFIG.size.desktop.height,
        maxHeight: 'calc(100vh - 100px)'
      }}
      data-testid="chat-window"
    >
      {/* ヘッダー */}
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <h3 className="font-semibold">AIアシスタント</h3>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={onClearMessages}
            disabled={messages.length === 0}
            aria-label="会話をクリア"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            aria-label="閉じる"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* メッセージエリア */}
      <div className="flex-1 px-4 py-4 overflow-y-auto" ref={scrollAreaRef}>
        {allMessages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onActionClick={handleActionClick}
          />
        ))}
        {isLoading && (
          <MessageBubble
            message={{
              id: 'typing',
              role: 'assistant',
              content: '',
              timestamp: new Date(),
              isTyping: true
            }}
          />
        )}
      </div>

      {/* 入力エリア */}
      <div className="border-t p-4">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="メッセージを入力..."
            disabled={isLoading}
            maxLength={CHAT_CONFIG.message.maxLength}
            className="flex-1"
            data-testid="chat-input"
          />
          <Button
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
            size="icon"
            aria-label="送信"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <div className="text-xs text-muted-foreground mt-2 text-right">
          {inputValue.length}/{CHAT_CONFIG.message.maxLength}
        </div>
      </div>
    </div>
  );
}

export default ChatWindow;