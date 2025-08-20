'use client';

import React from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Bot, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChatMessage } from '@/lib/chat/types';

interface MessageBubbleProps {
  message: ChatMessage;
  onActionClick?: (action: string) => void;
}

/**
 * メッセージバブルコンポーネント
 * ユーザーとアシスタントのメッセージを表示
 */
export function MessageBubble({ message, onActionClick }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isTyping = message.isTyping;

  return (
    <div
      className={cn(
        'flex gap-3 mb-4 animate-in slide-in-from-bottom-2 duration-300',
        isUser ? 'justify-end' : 'justify-start'
      )}
      data-testid={`${message.role}-message`}
    >
      {/* アバター */}
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Bot className="w-5 h-5 text-primary" />
        </div>
      )}

      <div className={cn('flex flex-col gap-1 max-w-[80%]', isUser && 'items-end')}>
        {/* メッセージバブル */}
        <Card
          className={cn(
            'px-4 py-2 rounded-2xl',
            isUser
              ? 'bg-primary text-primary-foreground rounded-br-sm'
              : 'bg-muted rounded-bl-sm',
            isTyping && 'min-w-[60px]'
          )}
        >
          {isTyping ? (
            <div className="flex gap-1 py-2">
              <span className="w-2 h-2 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
              <span className="w-2 h-2 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
              <span className="w-2 h-2 rounded-full bg-current animate-bounce" />
            </div>
          ) : (
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
          )}
        </Card>

        {/* タイムスタンプ */}
        <span className="text-xs text-muted-foreground px-2">
          {format(new Date(message.timestamp), 'HH:mm', { locale: ja })}
        </span>

        {/* 記事リスト（検索結果の場合） */}
        {message.articles && message.articles.length > 0 && (
          <div className="mt-2 space-y-2">
            {message.articles.slice(0, 3).map((article) => (
              <Card
                key={article.id}
                className="p-3 hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => window.open(article.url, '_blank')}
              >
                <h4 className="text-sm font-medium line-clamp-1">{article.title}</h4>
                {article.summary && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                    {article.summary}
                  </p>
                )}
                {article.source && (
                  <span className="text-xs text-muted-foreground">
                    {article.source.name}
                  </span>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* サジェストアクション */}
        {message.suggestedActions && message.suggestedActions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {message.suggestedActions.map((action, index) => (
              <Button
                key={index}
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => onActionClick?.(action)}
              >
                {action}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* ユーザーアバター */}
      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
          <User className="w-5 h-5 text-secondary-foreground" />
        </div>
      )}
    </div>
  );
}

export default MessageBubble;