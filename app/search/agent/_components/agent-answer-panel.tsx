'use client';

import React, { useState, useEffect, useMemo, useDeferredValue, useCallback, useRef } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkExtractArticleId from './remark-extract-article-id';
import {
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  Link2,
  ExternalLink,
  FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import { ButtonV2 } from '@/components/ui-v2/button-v2';
import type { AgentSearchResult } from '@/lib/hooks/useAgentSearch';
import { formatDate, formatDateWithTime } from '@/lib/utils/date';
import { Calendar } from 'lucide-react';

// Article section extracted from AI response
interface ArticleSection {
  articleId: string | null;
  title: string;
  summary: string;
  index: number;
}

// Result of extracting article sections and summary from AI response
interface ExtractedAnswer {
  sections: ArticleSection[];
  summary: string;
}

// Extract article sections and summary from markdown response
function extractArticleSections(text: string): ExtractedAnswer {
  const sections: ArticleSection[] = [];

  // Match numbered list items: 1. **Title** (match: X%) - Description
  const listItemPattern = /^\d+\.\s+\*\*(.+?)\*\*\s*(?:\[#([a-zA-Z0-9_-]+)\])?\s*(?:\(.*?(?:\d+(?:\.\d+)?%?).*?\))?\s*[-\u2013\u2014]?\s*([\s\S]*?)(?=\n\d+\.\s+\*\*|\n\n(?!\s)|$)/gm;

  let match;
  let index = 0;
  let lastEnd = 0;

  while ((match = listItemPattern.exec(text)) !== null) {
    const title = match[1].trim();
    const articleId = match[2] || null;
    let summary = match[3] ? match[3].trim() : '';

    // Clean up summary: remove article ID tokens and extra whitespace
    summary = summary.replace(/\[#[a-zA-Z0-9_-]+\]/g, '').trim();
    // Remove trailing link mentions
    summary = summary.replace(/\s*\n\s*\[.*?\]\(.*?\)\s*$/g, '').trim();
    // Truncate to reasonable length
    if (summary.length > 200) {
      summary = summary.slice(0, 200) + '...';
    }

    sections.push({
      articleId,
      title,
      summary,
      index: index++
    });

    lastEnd = listItemPattern.lastIndex;
  }

  // Extract summary/conclusion after the article list
  let extractedSummary = '';
  if (lastEnd > 0 && lastEnd < text.length) {
    let tail = text.slice(lastEnd).trim();

    // Remove markdown links and reference-style links
    tail = tail.replace(/^\s*-\s*\[.*?\]\(.*?\)\s*$/gm, '').trim();
    tail = tail.replace(/\[.*?\]\(.*?\)/g, '').trim();

    // Remove article ID tokens
    tail = tail.replace(/\[#[a-zA-Z0-9_-]+\]/g, '').trim();

    // Remove "---" separators
    tail = tail.replace(/^---+\s*/gm, '').trim();

    // Only use if it looks like actual content (not just whitespace or very short)
    if (tail.length > 20) {
      extractedSummary = tail;
    }
  }

  return { sections, summary: extractedSummary };
}

interface AgentAnswerPanelProps {
  result: AgentSearchResult | null;
  partialText: string | null;
  isStreaming: boolean;
  onFeedback?: (positive: boolean) => void;
  /** Display mode: 'search' for card display, 'qa' for simple markdown */
  mode?: 'search' | 'qa';
}

// トップレベル制御用の Context（0: ルート、1以上: ネスト）
const ListDepthContext = React.createContext(0);

export function AgentAnswerPanel({
  result,
  partialText,
  isStreaming,
  onFeedback,
  mode = 'search',
}: AgentAnswerPanelProps) {
  const [copied, setCopied] = useState(false);
  const [showEmptyState, setShowEmptyState] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState<'positive' | 'negative' | null>(null);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const displayText = useMemo(() => {
    if (partialText && !result) return partialText;
    return result?.response || '';
  }, [partialText, result]);

  // Empty state delay logic (150ms to prevent flicker)
  useEffect(() => {
    if (!isStreaming && !displayText?.trim() && !result?.articles?.length) {
      const timer = setTimeout(() => setShowEmptyState(true), 150);
      return () => clearTimeout(timer);
    } else {
      setShowEmptyState(false);
    }
  }, [isStreaming, displayText, result?.articles]);

  const deferredDisplayText = useDeferredValue(displayText);

  const handleCopy = async () => {
    try {
      // レンダリング後のテキスト（トークン除去済み）を取得
      const root = document.querySelector('[data-testid="agent-answer-markdown"]') as HTMLElement | null;
      let copyText = displayText;
      if (root) {
        const clone = root.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('[data-copy-exclude]').forEach((el) => el.remove());
        copyText = (clone.textContent ?? displayText).trim();
      }

      // 出典（元記事へのリンク）を追加
      const safeArticles = result?.articles ?? [];
      if (safeArticles.length > 0) {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
        const sourcesText = safeArticles.map((article) => {
          const title = article.translatedTitle || article.title;
          const url = `${baseUrl}/articles/${article.articleId}`;
          return `- [${title}](${url})`;
        }).join('\n');
        copyText += `\n\n出典:\n${sourcesText}`;
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(copyText);
        setCopied(true);
      } else {
        // Fallback for environments without clipboard API (e.g., headless browsers)
        const textarea = document.createElement('textarea');
        textarea.value = copyText;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (success) {
          setCopied(true);
        }
      }
    } catch (error) {
      console.error('クリップボードへのコピーに失敗しました:', error);
    }
  };

  const articles = result?.articles;
  const articleCount = articles?.length ?? 0;
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset feedback state when result changes
  useEffect(() => {
    setFeedbackSubmitted(null);
    setIsSubmittingFeedback(false);
  }, [result?.query]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }
    };
  }, []);

  // Debounced feedback handler
  const handleFeedback = useCallback((positive: boolean) => {
    if (isSubmittingFeedback || feedbackSubmitted) return;
    setIsSubmittingFeedback(true);
    setFeedbackSubmitted(positive ? 'positive' : 'negative');
    onFeedback?.(positive);
    // Reset submitting state after short delay (for visual feedback)
    feedbackTimeoutRef.current = setTimeout(() => setIsSubmittingFeedback(false), 300);
  }, [isSubmittingFeedback, feedbackSubmitted, onFeedback]);

  const articleMap = useMemo(() => {
    const safeArticles = articles ?? [];
    return new Map(safeArticles.map((article) => [article.articleId, article]));
  }, [articles]);

  const resultResponse = result?.response ?? '';
  const totalTokens = result?.usage?.totalTokens;

  // 応答に [#...] トークンが含まれるか（通常は true、フォールバック時は false）
  const hasEmbeddedIds = useMemo(() => /\[#\S+?\]/.test(resultResponse), [resultResponse]);

  // Extract article sections and summary from the response for card display
  const extractedAnswer = useMemo(() => {
    if (isStreaming || !result?.response) return { sections: [], summary: '' };
    return extractArticleSections(result.response);
  }, [isStreaming, result?.response]);

  // Enrich sections with article metadata
  const enrichedSections = useMemo(() => {
    return extractedAnswer.sections.map((section, idx) => {
      const meta = section.articleId
        ? articleMap.get(section.articleId)
        : articles?.[idx];
      return { ...section, meta };
    });
  }, [extractedAnswer.sections, articleMap, articles]);

  // Use card display when we have sections and not streaming
  const useCardDisplay = mode === 'search' && !isStreaming && enrichedSections.length > 0;

  type MarkdownLi = React.ReactElement<
    React.ComponentPropsWithoutRef<'li'> & { 'data-article-index'?: string }
  >;

  const isMarkdownLi = (node: React.ReactNode): node is MarkdownLi =>
    React.isValidElement(node) && node.type === 'li';

  // ol renderer component (for ListDepthContext hook usage)
  const OlComponent = ({ children, ...props }: React.ComponentPropsWithoutRef<'ol'>) => {
    const depth = React.useContext(ListDepthContext);
    const hasIdInThisOl = React.Children.toArray(children).some(
      (child) => isMarkdownLi(child) && (child.props as any)['data-article-id']
    );
    return (
      <ListDepthContext.Provider value={depth + 1}>
        <ol {...props}>
          {React.Children.map(children, (child, index) => {
            if (!isMarkdownLi(child)) return child;
            const shouldAddIndex = depth === 0 && !hasIdInThisOl && !hasEmbeddedIds;
            return shouldAddIndex
              ? React.cloneElement(child, { 'data-article-index': String(index) })
              : child;
          })}
        </ol>
      </ListDepthContext.Provider>
    );
  };

  return (
    <CardV2 variant="hover" className="p-6 border-l-4 border-[var(--tt-color-primary)]" role="article" aria-labelledby="answer-heading" data-testid="agent-result-card">
      <div className="flex items-start justify-between mb-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h2 id="answer-heading" className="text-xl md:text-2xl font-semibold">
              AI回答
            </h2>
          {result?.cached && (
            <BadgeV2 variant="secondary" className="text-xs">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              キャッシュ
            </BadgeV2>
          )}
          {result?.fallback && (
            <BadgeV2 variant="outline" className="text-xs text-[var(--tt-color-warning)] border-[var(--tt-color-warning)]">
              <AlertTriangle className="h-3 w-3 mr-1" />
              フォールバック
            </BadgeV2>
          )}
          </div>
          {articleCount > 0 && (
            <p className="text-sm text-[var(--tt-color-text-muted)]">
              {articleCount}件の記事から生成
            </p>
          )}
        </div>

        <div className="flex items-center gap-1">
          <ButtonV2
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-8 px-3 gap-1.5"
            aria-label="回答をコピー"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-green-600" aria-hidden="true" />
                <span className="text-xs text-green-600">コピー完了</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs hidden sm:inline">コピー</span>
              </>
            )}
          </ButtonV2>
        </div>
      </div>

      {result?.fallback && (
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            AI検索が一時的に利用できないため、通常の検索結果を表示しています
          </p>
        </div>
      )}

      {isStreaming && (
        <div
          data-testid="streaming-indicator"
          className="mb-4 p-4 bg-[var(--tt-color-primary)]/5 border border-[var(--tt-color-primary)]/20 rounded-lg"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--tt-color-primary)] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--tt-color-primary)]"></span>
            </div>
            <span className="text-base font-medium text-[var(--tt-color-text)]">
              回答を出力中...
            </span>
          </div>
          <p className="text-sm text-[var(--tt-color-text-muted)] pl-6">
            完了するとカード形式で表示されます。スクロールせずにお待ちください。
          </p>
        </div>
      )}

      {showEmptyState && (
        <CardV2
          variant="ghost"
          className="py-6 md:py-8 text-center"
          role="status"
          aria-live="polite"
          data-testid="agent-empty-state"
        >
          <h3 className="text-xl md:text-2xl font-semibold mb-2">
            {result?.fallback
              ? '関連する記事が見つかりませんでした'
              : '該当する記事が見つかりませんでした'}
          </h3>
          <p className="text-sm text-muted-foreground mb-4">以下を試してみてください:</p>
          <ul className="text-sm text-muted-foreground mb-4 text-left max-w-md mx-auto space-y-1">
            <li>- キーワードをより具体的にする（例: &quot;React&quot; → &quot;React 19のServer Components&quot;）</li>
            <li>- 技術名やバージョンを追加する</li>
            <li>- 検索期間を調整する</li>
          </ul>
          <div className="flex gap-2 justify-center">
            {/* shadcn/ui ButtonをasChildで維持: ButtonV2がasChildプロップをサポートしていないため */}
            <Button asChild variant="outline">
              <Link href="/search">通常検索を試す</Link>
            </Button>
          </div>
        </CardV2>
      )}

      {!showEmptyState && useCardDisplay && (
        <div
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-4 items-stretch"
          data-testid="agent-answer-cards"
        >
          {enrichedSections.map((item, i) => {
            const accentColor = i % 2 === 0 ? 'var(--tt-color-primary)' : 'var(--tt-color-secondary)';
            const displayTitle = item.meta?.translatedTitle?.trim() || item.meta?.title || item.title;
            const articleLink = item.meta?.articleId
              ? `/articles/${encodeURIComponent(item.meta.articleId)}`
              : null;

            return (
              <article
                key={item.articleId ?? i}
                className="group relative flex flex-col space-y-2 rounded-lg bg-white dark:bg-slate-800 p-4 shadow-sm border border-slate-200/60 dark:border-slate-700/60 transition-all duration-200 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 min-h-[140px] motion-safe:opacity-0 motion-safe:animate-[fadeInUp_0.4s_ease_forwards]"
                style={{
                  borderLeftWidth: '3px',
                  borderLeftColor: accentColor,
                  animationDelay: `${i * 60}ms`,
                }}
                data-testid="agent-article-card"
              >
                {/* 外部リンクボタン - 右上に絶対配置 */}
                {articleLink && (
                  <Button
                    asChild
                    size="sm"
                    variant="ghost"
                    className="absolute top-2 right-2 h-10 w-10 p-0 hover:bg-primary/10 opacity-60 group-hover:opacity-100 transition-opacity"
                  >
                    <Link
                      href={articleLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid="agent-article-link"
                      title="記事を開く"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </Button>
                )}

                {/* タイトル行 - 詳細要約と同じ構造 */}
                <h4 className="text-sm font-[var(--tt-font-heading)] font-semibold tracking-[var(--tt-tracking-tight)] flex items-center gap-2 pr-8">
                  <span
                    className="text-lg flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-muted/60 group-hover:bg-muted transition-colors duration-200"
                    aria-hidden="true"
                  >
                    <FileText className="h-4 w-4" style={{ color: accentColor }} />
                  </span>
                  <span className="flex-1 line-clamp-2" title={displayTitle}>
                    {displayTitle}
                  </span>
                </h4>

                {/* メタ情報 */}
                <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                  {item.meta?.similarity !== undefined && (
                    <BadgeV2 variant="secondary" className="text-xs">
                      {Math.round(item.meta.similarity * 100)}%
                    </BadgeV2>
                  )}
                  {item.meta?.publishedAt && (
                    <span
                      className="flex items-center gap-1"
                      title={formatDateWithTime(item.meta.publishedAt)}
                    >
                      <Calendar className="h-3 w-3" aria-hidden="true" />
                      {formatDate(item.meta.publishedAt)}
                    </span>
                  )}
                </div>

                {/* 要約テキスト - flex-1で残りスペースを埋める */}
                {item.summary && (
                  <p className="flex-1 text-sm font-[var(--tt-font-body)] text-slate-700 dark:text-slate-200 leading-relaxed break-words line-clamp-4">
                    {item.summary}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}

      {!showEmptyState && !useCardDisplay && (
        <div
          className="prose prose-sm dark:prose-invert w-full max-w-none md:max-w-4xl xl:max-w-5xl mb-4"
          data-testid="agent-answer-markdown"
        >
        <ListDepthContext.Provider value={0}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkBreaks, remarkExtractArticleId]}
            components={{
              a: ({ node: _node, ...props }) => (
                <a {...props} target="_blank" rel="noopener noreferrer" />
              ),
              ol: OlComponent,
              li: ({ node: _node, children, ...props }) => {
                const articleId = props['data-article-id'] as string | undefined;
                const indexAttr = props['data-article-index'] as string | number | undefined;

                const articleFromId = articleId ? articleMap.get(articleId) : undefined;
                const index =
                  typeof indexAttr === 'number'
                    ? indexAttr
                    : indexAttr !== undefined
                      ? Number(indexAttr)
                      : undefined;
                // indexフォールバックはIDトークン不在時のみ有効化（誤リンク防止）
                const articleFromIndex =
                  !articleId &&
                  !hasEmbeddedIds &&
                  typeof index === 'number' &&
                  Number.isInteger(index)
                    ? articles?.[index]
                    : undefined;
                const article = articleFromId ?? articleFromIndex ?? null;

                return (
                  <li {...props}>
                    {children}
                    {article && (
                      // shadcn/ui ButtonをasChildで維持: ButtonV2がasChildプロップをサポートしていないため
                      <Button
                        asChild
                        size="sm"
                        data-copy-exclude
                        className="ml-2 h-7 rounded-full bg-primary/15 text-primary hover:bg-primary/25 transition-colors inline-flex items-center"
                        title={
                          article.translatedTitle?.trim() ? article.translatedTitle : article.title
                        }
                      >
                        <Link
                          data-testid="agent-article-link"
                          href={`/articles/${encodeURIComponent(article.articleId)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Link2 className="mr-1 h-3 w-3" />
                          {article.translatedTitle?.trim() ? article.translatedTitle : article.title}
                        </Link>
                      </Button>
                    )}
                  </li>
                );
              },
            }}
          >
            {deferredDisplayText}
          </ReactMarkdown>
        </ListDepthContext.Provider>
        </div>
      )}

      <div className="flex items-center justify-between pt-4 border-t mt-4">
        <div className="text-xs text-muted-foreground">
          {typeof totalTokens === 'number' && (
            <span>トークン使用: {totalTokens.toLocaleString()}</span>
          )}
        </div>

        {onFeedback && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-[var(--tt-color-surface-muted)]">
            {feedbackSubmitted ? (
              <div className="flex items-center gap-2 text-sm" data-testid="feedback-thanks">
                <CheckCircle2 className="h-4 w-4 text-[var(--tt-color-primary)]" aria-hidden="true" />
                <span className="text-[var(--tt-color-text-muted)]">
                  フィードバックありがとうございます
                </span>
              </div>
            ) : (
              <>
                <span className="text-xs text-muted-foreground mr-2 hidden sm:inline">この回答は役立ちましたか？</span>
                <ButtonV2
                  variant="ghost"
                  size="sm"
                  onClick={() => handleFeedback(true)}
                  disabled={isSubmittingFeedback}
                  className="h-11 w-11 md:h-9 md:w-9 hover:bg-green-100 dark:hover:bg-green-900/30 hover:text-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="役立った"
                  data-testid="feedback-positive"
                >
                  <ThumbsUp className="h-5 w-5 md:h-4 md:w-4" />
                </ButtonV2>
                <ButtonV2
                  variant="ghost"
                  size="sm"
                  onClick={() => handleFeedback(false)}
                  disabled={isSubmittingFeedback}
                  className="h-11 w-11 md:h-9 md:w-9 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="改善が必要"
                  data-testid="feedback-negative"
                >
                  <ThumbsDown className="h-5 w-5 md:h-4 md:w-4" />
                </ButtonV2>
              </>
            )}
          </div>
        )}
      </div>
    </CardV2>
  );
}
