'use client';

import React from 'react';
import { MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatButtonProps {
  isOpen: boolean;
  onClick: () => void;
  unreadCount?: number;
  className?: string;
}

/**
 * チャットボタンコンポーネント
 * 画面右下に固定表示され、クリックでチャットウィンドウを開閉する
 */
export function ChatButton({ 
  isOpen, 
  onClick, 
  unreadCount = 0,
  className 
}: ChatButtonProps) {
  return (
    <Button
      onClick={onClick}
      size="lg"
      className={cn(
        'fixed bottom-20 right-5 z-[70]',
        'h-14 w-14 rounded-full shadow-lg',
        'transition-all duration-300 hover:scale-110',
        'bg-primary hover:bg-primary/90',
        className
      )}
      data-testid="chat-button"
      aria-label={isOpen ? 'チャットを閉じる' : 'チャットを開く'}
    >
      <div className="relative">
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <>
            <MessageCircle className="h-6 w-6" />
            {unreadCount > 0 && (
              <span 
                className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center animate-pulse"
                aria-label={`${unreadCount}件の未読メッセージ`}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </>
        )}
      </div>
    </Button>
  );
}

export default ChatButton;