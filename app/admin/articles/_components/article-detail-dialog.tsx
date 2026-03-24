'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { formatDateWithTime } from '@/lib/utils/date';
import type { AdminArticleDetail } from '../_types';

const SKIP_DETAILED_SUMMARY_MARKER = '__SKIP_DETAILED_SUMMARY__';

async function fetchArticleDetail(id: string): Promise<AdminArticleDetail> {
  const res = await fetch(`/api/admin/articles/${id}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to fetch article detail');
  }
  return res.json();
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  return formatDateWithTime(dateStr);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-muted-foreground mb-2 text-sm font-semibold tracking-wide uppercase">
      {children}
    </h3>
  );
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-muted-foreground min-w-[120px] shrink-0">
        {label}
      </span>
      <span className="break-all">{children}</span>
    </div>
  );
}

interface ArticleDetailDialogProps {
  articleId: string | null;
  onClose: () => void;
}

export function ArticleDetailDialog({
  articleId,
  onClose,
}: ArticleDetailDialogProps) {
  const [isContentOpen, setIsContentOpen] = useState(false);

  const { data: article, isLoading } = useQuery({
    queryKey: ['admin', 'article-detail', articleId],
    queryFn: () => fetchArticleDetail(articleId!),
    enabled: !!articleId,
    staleTime: 300_000,
  });

  return (
    <Dialog open={!!articleId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        {isLoading ? (
          <div className="space-y-3 p-2">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        ) : article ? (
          <div className="space-y-6">
            <DialogHeader>
              <DialogTitle className="text-base leading-snug">
                {article.translatedTitle ?? article.title}
              </DialogTitle>
            </DialogHeader>

            {/* 基本情報 */}
            <section className="space-y-2">
              <SectionTitle>基本情報</SectionTitle>
              <InfoRow label="元タイトル">{article.title}</InfoRow>
              {article.translatedTitle && (
                <InfoRow label="翻訳タイトル">
                  {article.translatedTitle}
                </InfoRow>
              )}
              <InfoRow label="URL">
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2 hover:no-underline"
                >
                  {article.url}
                </a>
              </InfoRow>
              <InfoRow label="ソース">{article.sourceName}</InfoRow>
              <InfoRow label="カテゴリ">
                {article.category ? (
                  <Badge variant="outline">{article.category}</Badge>
                ) : (
                  '-'
                )}
              </InfoRow>
              <InfoRow label="公開日">
                {formatDateTime(article.publishedAt)}
              </InfoRow>
            </section>

            {/* 要約 */}
            <section className="space-y-2">
              <SectionTitle>要約</SectionTitle>
              {article.summary ? (
                <InfoRow label="一行要約">{article.summary}</InfoRow>
              ) : (
                <InfoRow label="一行要約">
                  <span className="text-muted-foreground">なし</span>
                </InfoRow>
              )}
              {article.detailedSummary &&
                article.detailedSummary !== SKIP_DETAILED_SUMMARY_MARKER && (
                  <InfoRow label="詳細要約">
                    <span className="whitespace-pre-wrap">
                      {article.detailedSummary}
                    </span>
                  </InfoRow>
                )}
            </section>

            {/* 品質 */}
            <section className="space-y-2">
              <SectionTitle>品質情報</SectionTitle>
              <InfoRow label="品質スコア">{article.qualityScore}</InfoRow>
              <InfoRow label="要約バージョン">{article.summaryVersion}</InfoRow>
              {article.skipReason && (
                <InfoRow label="スキップ理由">{article.skipReason}</InfoRow>
              )}
              {article.summaryError && (
                <InfoRow label="要約エラー">
                  <span className="text-destructive">
                    {article.summaryError}
                  </span>
                </InfoRow>
              )}
            </section>

            {/* タグ */}
            {article.tags && article.tags.length > 0 && (
              <section>
                <SectionTitle>タグ</SectionTitle>
                <div className="flex flex-wrap gap-1.5">
                  {article.tags.map((tag) => (
                    <Badge key={tag.id} variant="outline">
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              </section>
            )}

            {/* 本文プレビュー */}
            {article.content && (
              <section>
                <SectionTitle>本文プレビュー</SectionTitle>
                <Collapsible
                  open={isContentOpen}
                  onOpenChange={setIsContentOpen}
                >
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-1"
                    >
                      {isContentOpen ? '折りたたむ' : '本文を表示'}
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${isContentOpen ? 'rotate-180' : ''}`}
                      />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="bg-muted mt-2 rounded-md p-3 text-sm whitespace-pre-wrap">
                      {article.content.slice(0, 500)}
                      {article.content.length > 500 && (
                        <span className="text-muted-foreground">
                          …（先頭500文字）
                        </span>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </section>
            )}

            {/* メタデータ */}
            <section className="space-y-2">
              <SectionTitle>メタデータ</SectionTitle>
              <InfoRow label="ブックマーク数">{article.bookmarks}</InfoRow>
              <InfoRow label="難易度">{article.difficulty ?? '-'}</InfoRow>
              <InfoRow label="記事タイプ">{article.articleType ?? '-'}</InfoRow>
              <InfoRow label="本文文字数">
                {article.contentLength?.toLocaleString() ?? '-'}
              </InfoRow>
              <InfoRow label="要約生成日時">
                {formatDateTime(article.summaryComputedAt)}
              </InfoRow>
              <InfoRow label="品質スコア計算日時">
                {formatDateTime(article.qualityScoreComputedAt)}
              </InfoRow>
              <InfoRow label="本文更新日時">
                {formatDateTime(article.contentUpdatedAt)}
              </InfoRow>
              <InfoRow label="作成日時">
                {formatDateTime(article.createdAt)}
              </InfoRow>
              <InfoRow label="更新日時">
                {formatDateTime(article.updatedAt)}
              </InfoRow>
            </section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
