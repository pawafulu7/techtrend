'use client';

import React, { useState, useEffect } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Calendar, User, Tag, BarChart2 } from 'lucide-react';
import type { Article, Source, Tag as TagType } from '@prisma/client';

type ArticleWithRelations = Article & {
  source: Source;
  tags: TagType[];
};

interface ArticlePreviewProps {
  article: ArticleWithRelations;
  children: React.ReactNode;
}

interface PreviewContentProps {
  article: ArticleWithRelations;
}

const PreviewContent: React.FC<PreviewContentProps> = ({ article }) => {
  // コンテンツの最初の200-300文字を抽出
  const getPreviewText = (content: string | null) => {
    if (!content) return article.summary || '内容のプレビューはありません';
    
    // HTMLタグを除去
    const textContent = content.replace(/<[^>]*>/g, '');
    
    // 最初の300文字を取得
    const preview = textContent.slice(0, 300);
    
    // 最後の句読点で区切る
    const lastPunctuation = Math.max(
      preview.lastIndexOf('。'),
      preview.lastIndexOf('、'),
      preview.lastIndexOf('.'),
      preview.lastIndexOf(',')
    );
    
    if (lastPunctuation > 200) {
      return preview.slice(0, lastPunctuation + 1);
    }
    
    return preview + (textContent.length > 300 ? '...' : '');
  };

  const previewText = getPreviewText(article.content);
  
  // 難易度のラベル
  const getDifficultyLabel = (difficulty: string | null) => {
    switch (difficulty) {
      case 'beginner':
        return { label: '初級', color: 'text-green-600' };
      case 'intermediate':
        return { label: '中級', color: 'text-yellow-600' };
      case 'advanced':
        return { label: '上級', color: 'text-red-600' };
      default:
        return { label: '未設定', color: 'text-gray-500' };
    }
  };

  const difficulty = getDifficultyLabel(article.difficulty);

  return (
    <div className="p-4 max-w-md">
      <h3 className="font-bold text-lg mb-2 line-clamp-2">{article.title}</h3>
      
      <div className="space-y-2 mb-3 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          <span>
            {format(new Date(article.publishedAt), 'yyyy年MM月dd日 HH:mm', { locale: ja })}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <User className="w-4 h-4" />
          <span>{article.source.name}</span>
        </div>
        
        {article.difficulty && (
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4" />
            <span className={difficulty.color}>{difficulty.label}</span>
          </div>
        )}
      </div>
      
      <p className="text-sm text-gray-700 mb-3 whitespace-pre-wrap">
        {previewText}
      </p>
      
      {article.tags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Tag className="w-4 h-4 text-gray-500" />
          {article.tags.map((tag) => (
            <span
              key={tag.id}
              className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded"
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export const ArticlePreview: React.FC<ArticlePreviewProps> = ({ article, children }) => {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [touchTimer, setTouchTimer] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // モバイルデバイスの検出
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // デスクトップでのホバー処理
  const handleMouseEnter = () => {
    if (!isMobile) {
      const timer = setTimeout(() => setOpen(true), 300);
      setTouchTimer(timer);
    }
  };

  const handleMouseLeave = () => {
    if (!isMobile) {
      if (touchTimer) {
        clearTimeout(touchTimer);
        setTouchTimer(null);
      }
      setOpen(false);
    }
  };

  // モバイルでの長押し処理
  const handleTouchStart = () => {
    if (isMobile) {
      const timer = setTimeout(() => {
        setOpen(true);
        // 振動フィードバック（対応デバイスのみ）
        if ('vibrate' in navigator) {
          navigator.vibrate(10);
        }
      }, 500);
      setTouchTimer(timer);
    }
  };

  const handleTouchEnd = () => {
    if (touchTimer) {
      clearTimeout(touchTimer);
      setTouchTimer(null);
    }
  };

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (touchTimer) {
        clearTimeout(touchTimer);
      }
    };
  }, [touchTimer]);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <div
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          {children}
        </div>
      </Popover.Trigger>
      
      <Popover.Portal>
        <Popover.Content
          className="z-50 bg-white rounded-lg shadow-lg border border-gray-200 animate-in fade-in-0 zoom-in-95"
          sideOffset={5}
          side={isMobile ? 'top' : 'right'}
          align="start"
          onInteractOutside={() => isMobile && setOpen(false)}
        >
          <PreviewContent article={article} />
          <Popover.Arrow className="fill-white" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};