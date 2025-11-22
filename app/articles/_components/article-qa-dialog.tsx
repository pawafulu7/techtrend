'use client';

import { useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ArticleQAClient } from './article-qa-client';

export interface ArticleQADialogProps {
  articleId: string;
  articleTitle: string;
  children: ReactNode;
}

export function ArticleQADialog({ articleId, articleTitle, children }: ArticleQADialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        aria-label={`${articleTitle}の記事について質問するダイアログ`}
        className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="sr-only">{articleTitle}の記事について質問する</DialogTitle>
          <DialogDescription>AIアシスタントに記事内容の疑問を質問できます。</DialogDescription>
        </DialogHeader>
        <ArticleQAClient articleId={articleId} articleTitle={articleTitle} onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
