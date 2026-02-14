import { notFound } from 'next/navigation';
import Link from 'next/link';
import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Download,
  ExternalLink,
  GraduationCap,
  MessageSquare,
} from 'lucide-react';
import { formatDateWithTime } from '@/lib/utils/date';
import { getSourceColor } from '@/lib/utils/source-colors';
import { cn } from '@/lib/utils';
import { RelatedArticles } from '@/app/components/article/related-articles';
import { ArticleTracker } from '@/app/components/analytics/ArticleTracker';
import { ViewTracker } from '@/components/article/view-tracker';
import { ReadTracker } from '@/components/article/read-tracker';
import { DetailedSummaryDisplay } from '@/app/components/article/detailed-summary-display';
import { OptimizedImage } from '@/app/components/common/optimized-image';
import { FavoriteButton } from '@/app/components/article/favorite-button';
import { articleDetailCache } from '@/lib/cache/article-detail-cache';
import { ArticleQADialog } from '@/app/articles/_components/article-qa-dialog';
import { stripHtmlTags } from '@/lib/utils/html-sanitizer';
import { CommentSection } from '@/app/components/comment';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    from?: string;
  }>;
}

/**
 * Get article with relations from cache
 * Note: Favorite status is now fetched client-side via FavoriteButton
 * to enable ISR caching of article content
 */
async function getArticle(id: string) {
  return await articleDetailCache.getArticleWithRelations(id);
}

// ISR: Revalidate every 60 seconds
// Article updates trigger revalidatePath via articleDetailCache.invalidate()
export const revalidate = 60;

export default async function ArticlePage({ params, searchParams }: PageProps) {
  // Parallel execution of params and searchParams
  // Note: Session is not needed here as favorites are fetched client-side
  const [{ id }, { from }] = await Promise.all([params, searchParams]);

  // セキュリティ: fromパラメータの検証
  const getReturnUrl = (fromParam: string | undefined): string => {
    if (!fromParam) return '/';

    // 特定のキーワードから適切なURLへマッピング
    if (fromParam === 'digest') return '/digest';

    try {
      const decodedUrl = decodeURIComponent(fromParam);
      // 相対パスまたは同一オリジンのみ許可
      if (decodedUrl.startsWith('/') && !decodedUrl.startsWith('//')) {
        return decodedUrl;
      }
      return '/';
    } catch {
      return '/';
    }
  };

  const returnUrl = getReturnUrl(from);
  const returnLabel =
    from === 'digest' ? 'ダイジェストに戻る' : '記事一覧に戻る';

  // 記事を取得（お気に入り状態はクライアントサイドで取得）
  const article = await getArticle(id);

  if (!article) {
    notFound();
  }

  const sourceColor = getSourceColor(article.source.name);
  const publishedDate = new Date(article.publishedAt);
  // Server Component: Date.now() is evaluated once per request, so it's safe here.
  const hoursAgo = Math.floor(
    // eslint-disable-next-line react-hooks/purity -- Server Component, evaluated once per request
    (Date.now() - publishedDate.getTime()) / (1000 * 60 * 60)
  );
  const isNew = hoursAgo < 24;

  // スライドサービス判定（Speaker DeckとDocswell）
  const isSlideService =
    article.source.name === 'Speaker Deck' ||
    article.source.name === 'Docswell';

  // 短い記事（500文字以下）の判定
  const isShortArticle =
    article.detailedSummary === '__SKIP_DETAILED_SUMMARY__' ||
    (article.content && article.content.length <= 500);

  const detailedSummaryText =
    article.detailedSummary &&
    article.detailedSummary !== '__SKIP_DETAILED_SUMMARY__'
      ? stripHtmlTags(article.detailedSummary)
      : '';
  const qaSummarySource = detailedSummaryText || article.summary || '';
  const qaSummary = qaSummarySource ? qaSummarySource.slice(0, 280) : null;
  const qaTopics = (
    article.tags
      ?.map((tag) => tag.name)
      .filter((name): name is string => Boolean(name)) ?? []
  ).slice(0, 4);

  return (
    <div className="from-background to-muted/20 min-h-screen bg-gradient-to-b">
      <div className="w-full px-6 py-6">
        <ArticleTracker
          articleId={article.id}
          title={article.title}
          tagNames={article.tags.map((t) => t.name)}
          sourceName={article.source.name}
          difficulty={article.difficulty}
        />
        <ViewTracker articleId={article.id} />
        <ReadTracker articleId={article.id} />
        <div className="mb-2">
          <Button variant="ghost" size="sm" className="min-h-[44px]" asChild>
            <Link
              href={returnUrl}
              className="flex items-center gap-1.5 text-sm"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {returnLabel}
            </Link>
          </Button>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="flex-1 space-y-6">
            <Card className="gap-4 bg-[var(--tt-color-surface-muted)]">
              <CardHeader>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      {isNew && (
                        <BadgeV2 variant="primary" className="text-xs">
                          NEW
                        </BadgeV2>
                      )}
                      <BadgeV2
                        variant="outline"
                        className={cn(
                          'text-xs font-medium',
                          sourceColor.tag,
                          sourceColor.border,
                          sourceColor.hover
                        )}
                      >
                        {article.source.name}
                      </BadgeV2>
                      <div
                        className="flex items-center gap-3 text-xs text-[var(--tt-color-text-muted)]"
                        data-testid="article-datetime-area"
                      >
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" aria-hidden="true" />
                          <span className="sr-only">公開日:</span>
                          <span>{formatDateWithTime(article.publishedAt)}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Download className="h-3 w-3" aria-hidden="true" />
                          <span className="sr-only">収集日:</span>
                          <span>{formatDateWithTime(article.createdAt)}</span>
                        </span>
                      </div>
                      {article.difficulty && (
                        <BadgeV2
                          variant={
                            article.difficulty === 'beginner'
                              ? 'positive'
                              : article.difficulty === 'intermediate'
                                ? 'info'
                                : 'secondary'
                          }
                          className="text-xs font-medium"
                        >
                          <GraduationCap className="mr-1 h-3 w-3" />
                          {article.difficulty === 'beginner' && '初級'}
                          {article.difficulty === 'intermediate' && '中級'}
                          {article.difficulty === 'advanced' && '上級'}
                        </BadgeV2>
                      )}
                    </div>
                    <FavoriteButton
                      articleId={article.id}
                      className="h-9"
                      fetchInitialStatus={true}
                    />
                  </div>

                  <h1 className="text-2xl font-bold">
                    {article.translatedTitle || article.title}
                  </h1>

                  {article.tags && article.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {article.tags.map((tag) => (
                        <BadgeV2
                          key={tag.id}
                          variant="outline"
                          className="cursor-pointer"
                          asChild
                        >
                          <Link
                            href={`/?tags=${encodeURIComponent(tag.name)}&tagMode=OR`}
                          >
                            {tag.name}
                          </Link>
                        </BadgeV2>
                      ))}
                    </div>
                  )}
                </div>
              </CardHeader>

              <CardContent className="!-mt-4 space-y-4">
                {/* Translation notice for translated articles */}
                {article.translatedTitle && (
                  <div
                    role="note"
                    className="flex items-center gap-2 rounded-sm border-l-4 border-[var(--tt-color-info-border)] bg-[var(--tt-color-info-bg)] px-4 py-2"
                    data-testid="translation-notice"
                  >
                    <svg
                      className="h-4 w-4 shrink-0 text-[var(--tt-color-info)]"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <p className="text-sm text-[var(--tt-color-info)]">
                      このタイトルと要約は英語記事から自動翻訳されています
                    </p>
                  </div>
                )}

                {/* スライドサービスまたは短い記事の場合はサムネイル表示、それ以外は詳細要約表示 */}
                {(isSlideService || isShortArticle) && article.thumbnail ? (
                  <>
                    <div className="mx-auto max-w-2xl">
                      {/* max-h-[480px] is a defensive constraint for oversized images.
                        If max-w-2xl changes, adjust max-h to maintain 16:9 ratio. */}
                      <div className="relative aspect-video max-h-[480px] overflow-hidden rounded-lg bg-[var(--tt-color-surface-muted)]">
                        <OptimizedImage
                          src={article.thumbnail}
                          alt={article.title}
                          fill
                          priority={true}
                          className="object-contain transition-opacity duration-200"
                          sizes="(max-width: 768px) 100vw, 672px"
                        />
                      </div>
                    </div>
                    <div className="mt-4 rounded-lg bg-[var(--tt-color-surface-muted)] p-4">
                      <p className="text-sm text-[var(--tt-color-text-muted)]">
                        {isShortArticle && !isSlideService
                          ? 'この記事は内容が簡潔なため、要約のみを表示しています。'
                          : 'このプレゼンテーションの詳細は元記事でご確認ください。'}
                      </p>
                    </div>
                  </>
                ) : isShortArticle ? (
                  <div className="space-y-2 rounded-lg bg-[var(--tt-color-surface-muted)] p-4">
                    <p className="text-sm font-medium">要約</p>
                    <p className="text-sm text-[var(--tt-color-text-muted)]">
                      {article.summary || '詳細は元記事でご確認ください。'}
                    </p>
                    {article.content && (
                      <div className="mt-4 border-t pt-4">
                        <p className="text-xs text-[var(--tt-color-text-muted)]">
                          ※ この記事は{article.content.length}文字の短い記事です
                        </p>
                      </div>
                    )}
                  </div>
                ) : article.detailedSummary &&
                  article.detailedSummary !== '__SKIP_DETAILED_SUMMARY__' ? (
                  <>
                    {article.summary && (
                      <div className="rounded-lg border-l-4 border-[var(--tt-color-primary)] bg-[var(--tt-color-primary)]/5 p-4">
                        <p className="mb-1 text-sm font-semibold tracking-tight">
                          概要
                        </p>
                        <p className="text-foreground/80 text-sm leading-relaxed">
                          {article.summary}
                        </p>
                      </div>
                    )}
                    <DetailedSummaryDisplay
                      detailedSummary={article.detailedSummary}
                      articleType={
                        article.articleType as
                          | 'release'
                          | 'problem-solving'
                          | 'tutorial'
                          | 'tech-intro'
                          | 'implementation'
                          | undefined
                      }
                      summaryVersion={article.summaryVersion}
                    />
                  </>
                ) : article.summary ? (
                  <div className="rounded-lg bg-[var(--tt-color-surface-muted)] p-4">
                    <p className="mb-1 text-sm font-medium">要約</p>
                    <p className="text-sm text-[var(--tt-color-text-muted)]">
                      {article.summary}
                    </p>
                  </div>
                ) : null}

                <div className="flex items-center justify-between border-t pt-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[var(--tt-color-text-muted)]">
                      品質スコア:
                    </span>
                    <BadgeV2 variant="secondary">
                      {Math.round(article.qualityScore)}
                    </BadgeV2>
                  </div>

                  <div className="flex items-center gap-4">
                    {article.content && article.content.length > 0 && (
                      <span className="flex items-center gap-1 text-sm text-[var(--tt-color-text-muted)]">
                        <Clock className="h-4 w-4" />
                        <span>
                          {Math.max(1, Math.ceil(article.content.length / 500))}
                          分 / {article.content.length.toLocaleString('ja-JP')}
                          字
                        </span>
                      </span>
                    )}
                    <Button asChild>
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2"
                      >
                        <ExternalLink className="h-4 w-4" />
                        元記事を読む
                      </a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <ArticleQADialog
              articleId={article.id}
              articleTitle={article.translatedTitle || article.title}
              articleSummary={qaSummary}
              articleTopics={qaTopics}
            >
              <Button variant="outline" size="lg" className="w-full sm:w-auto">
                <MessageSquare className="mr-2 h-5 w-5" />
                記事について質問する
              </Button>
            </ArticleQADialog>

            {/* 個人メモ（コメント）セクション */}
            <CommentSection articleId={article.id} />
          </div>

          <div className="w-full shrink-0 lg:w-80">
            <RelatedArticles articleId={article.id} />
          </div>
        </div>
      </div>
    </div>
  );
}
