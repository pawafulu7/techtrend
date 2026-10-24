'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui-v2/button-v2';
import { ArticleQAClient } from './article-qa-client';

export interface ArticleQAPanelProps {
  articleId: string;
  articleTitle: string;
  articleSummary?: string | null;
  articleTopics?: string[];
}

/**
 * 記事について質問するパネル（Issue #740）
 *
 * ボタンを押すと、記事のカードの下（本文の列の中）に質問欄と回答を開く。
 * ダイアログで開くと本文が隠れ、本文と回答を見比べられないため、どの幅でもその場に開く。
 * 閉じたらボタンにフォーカスを戻す。
 */
export function ArticleQAPanel({
  articleId,
  articleTitle,
  articleSummary,
  articleTopics,
}: ArticleQAPanelProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);

  useEffect(() => {
    if (open || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    triggerRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <Button
        ref={triggerRef}
        variant="outline"
        size="lg"
        className="w-full sm:w-auto"
        onClick={() => setOpen(true)}
      >
        <MessageSquare className="mr-2 h-5 w-5" aria-hidden="true" />
        記事について質問する
      </Button>
    );
  }

  return (
    <ArticleQAClient
      articleId={articleId}
      articleTitle={articleTitle}
      articleSummary={articleSummary ?? undefined}
      articleTopics={articleTopics}
      autoFocus
      onClose={() => {
        restoreFocusRef.current = true;
        setOpen(false);
      }}
    />
  );
}
