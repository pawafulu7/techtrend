'use client';

import React, { useMemo, useDeferredValue } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkExtractArticleId from './remark-extract-article-id';
import { ExternalLink, FileText, Calendar, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import type { AgentSearchResult } from '@/lib/hooks/useAgentSearch';
import { formatDate, formatDateWithTime } from '@/lib/utils/date';

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
  // Pattern captures: 1=title, 2=articleId token, 3=description
  // Format: "1. **Title** [#id] (match: 80%) - Description"
  //   - [#id] and (match%) are optional
  //   - Lookahead stops at next numbered item or double newline
  const listItemPattern =
    /^\d+\.\s+\*\*(.+?)\*\*\s*(?:\[#([a-zA-Z0-9_-]+)\])?\s*(?:\(.*?(?:\d+(?:\.\d+)?%?).*?\))?\s*[-\u2013\u2014]?\s*([\s\S]*?)(?=\n\d+\.\s+\*\*|\n\n(?!\s)|$)/gm;

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
      index: index++,
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

// Top-level control Context (0: root, 1+: nested)
const ListDepthContext = React.createContext(0);

type MarkdownLi = React.ReactElement<
  React.ComponentPropsWithoutRef<'li'> & { 'data-article-index'?: string }
>;

const isMarkdownLi = (node: React.ReactNode): node is MarkdownLi =>
  React.isValidElement(node) &&
  (node.type === 'li' || (node.props as any)?.node?.tagName === 'li');

// OlComponent extracted outside render to stabilize component reference
function OlComponent({
  children,
  hasEmbeddedIds,
  node: _node,
  ...props
}: React.ComponentPropsWithoutRef<'ol'> & {
  hasEmbeddedIds: boolean;
  node?: unknown;
}) {
  const depth = React.useContext(ListDepthContext);
  const hasIdInThisOl = React.Children.toArray(children).some(
    (child) => isMarkdownLi(child) && (child.props as any)['data-article-id']
  );
  return (
    <ListDepthContext.Provider value={depth + 1}>
      <ol {...props}>
        {React.Children.map(children, (child, index) => {
          if (!isMarkdownLi(child)) return child;
          const shouldAddIndex =
            depth === 0 && !hasIdInThisOl && !hasEmbeddedIds;
          return shouldAddIndex
            ? React.cloneElement(child, {
                'data-article-index': String(index),
              })
            : child;
        })}
      </ol>
    </ListDepthContext.Provider>
  );
}

interface AnswerContentProps {
  result: AgentSearchResult | null;
  displayText: string;
  showEmptyState: boolean;
}

export function AnswerContent({
  result,
  displayText,
  showEmptyState,
}: AnswerContentProps) {
  const articles = result?.articles;
  const resultResponse = result?.response ?? '';

  const deferredDisplayText = useDeferredValue(displayText);

  const articleMap = useMemo(() => {
    const safeArticles = articles ?? [];
    return new Map(safeArticles.map((article) => [article.articleId, article]));
  }, [articles]);

  // Whether the response contains [#...] tokens (usually true, false for fallback)
  const hasEmbeddedIds = useMemo(
    () => /\[#\S+?\]/.test(resultResponse),
    [resultResponse]
  );

  // Extract article sections and summary from the response for card display
  const extractedAnswer = useMemo(() => {
    if (!resultResponse) return { sections: [], summary: '' };
    return extractArticleSections(resultResponse);
  }, [resultResponse]);

  // Enrich sections with article metadata
  const enrichedSections = useMemo(() => {
    return extractedAnswer.sections.map((section, idx) => {
      const meta = section.articleId
        ? articleMap.get(section.articleId)
        : articles?.[idx];
      return { ...section, meta };
    });
  }, [extractedAnswer.sections, articleMap, articles]);

  // Build display items: prefer direct articles with summary (direct search result),
  // fall back to extractArticleSections output (LLM response parse)
  const displayItems = useMemo(() => {
    const directArticles = articles ?? [];
    if (directArticles.length > 0 && directArticles.some((a) => a.summary)) {
      return directArticles.map((article, i) => ({
        articleId: article.articleId,
        title: article.translatedTitle?.trim() || article.title,
        summary: article.summary ?? '',
        index: i,
        meta: article,
      }));
    }
    return enrichedSections;
  }, [articles, enrichedSections]);

  // Use card display when displayItems are available
  const useCardDisplay = displayItems.length > 0;

  return (
    <>
      {showEmptyState && (
        <CardV2
          variant="ghost"
          className="py-6 text-center md:py-8"
          role="status"
          aria-live="polite"
          data-testid="agent-empty-state"
        >
          <h3 className="mb-2 text-xl font-semibold md:text-2xl">
            {result?.fallback
              ? '関連する記事が見つかりませんでした'
              : '該当する記事が見つかりませんでした'}
          </h3>
          <p className="text-muted-foreground mb-4 text-sm">
            以下を試してみてください:
          </p>
          <ul className="text-muted-foreground mx-auto mb-4 max-w-md space-y-1 text-left text-sm">
            <li>
              - キーワードをより具体的にする（例: &quot;React&quot; →
              &quot;React 19のServer Components&quot;）
            </li>
            <li>- 技術名やバージョンを追加する</li>
            <li>- 検索期間を調整する</li>
          </ul>
          <div className="flex justify-center gap-2">
            {/* shadcn/ui ButtonをasChildで維持: ButtonV2がasChildプロップをサポートしていないため */}
            <Button asChild variant="outline">
              <Link href="/search">通常検索を試す</Link>
            </Button>
          </div>
        </CardV2>
      )}

      {!showEmptyState && useCardDisplay && (
        <div
          className="mb-4 grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3"
          data-testid="agent-answer-cards"
        >
          {displayItems.map((item, i) => {
            const accentColor =
              i % 2 === 0
                ? 'var(--tt-color-primary)'
                : 'var(--tt-color-secondary)';
            const displayTitle =
              item.meta?.translatedTitle?.trim() ||
              item.meta?.title ||
              item.title;
            const articleLink = item.meta?.articleId
              ? `/articles/${encodeURIComponent(item.meta.articleId)}`
              : null;

            return (
              <article
                key={item.articleId ?? i}
                className="group relative flex min-h-[140px] flex-col space-y-2 rounded-lg border border-[var(--tt-color-border)] bg-[var(--tt-color-surface)] p-4 shadow-sm transition-all duration-200 hover:border-[var(--tt-color-primary)]/40 hover:shadow-md motion-safe:animate-[fadeInUp_0.4s_ease_forwards] motion-safe:opacity-0"
                style={{
                  borderLeftWidth: '3px',
                  borderLeftColor: accentColor,
                  animationDelay: `${i * 60}ms`,
                }}
                data-testid="agent-article-card"
              >
                {/* External link button - absolute positioned top-right */}
                {articleLink && (
                  <Button
                    asChild
                    size="sm"
                    variant="ghost"
                    className="hover:bg-primary/10 absolute top-2 right-2 h-10 w-10 p-0 opacity-60 transition-opacity group-hover:opacity-100"
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

                {/* Title row */}
                <h4 className="flex items-center gap-2 pr-8 font-[family-name:var(--tt-font-heading)] text-sm font-semibold tracking-[var(--tt-tracking-tight)]">
                  <span
                    className="bg-muted/60 group-hover:bg-muted flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-lg transition-colors duration-200"
                    aria-hidden="true"
                  >
                    <FileText
                      className="h-4 w-4"
                      style={{ color: accentColor }}
                    />
                  </span>
                  <span className="line-clamp-2 flex-1" title={displayTitle}>
                    {displayTitle}
                  </span>
                </h4>

                {/* Meta info */}
                <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
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

                {/* Summary text - flex-1 fills remaining space */}
                {item.summary && (
                  <p className="line-clamp-4 flex-1 font-[family-name:var(--tt-font-body)] text-sm leading-relaxed break-words text-[var(--tt-color-text)]">
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
          className="prose prose-sm dark:prose-invert mb-4 w-full max-w-none md:max-w-4xl xl:max-w-5xl"
          data-testid="agent-answer-markdown"
        >
          <ListDepthContext.Provider value={0}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks, remarkExtractArticleId]}
              components={{
                a: ({ node: _node, ...props }) => (
                  <a {...props} target="_blank" rel="noopener noreferrer" />
                ),
                ol: (props) => (
                  <OlComponent {...props} hasEmbeddedIds={hasEmbeddedIds} />
                ),
                li: ({ node: _node, children, ...props }) => {
                  const articleId = props['data-article-id'] as
                    | string
                    | undefined;
                  const indexAttr = props['data-article-index'] as
                    | string
                    | number
                    | undefined;

                  const articleFromId = articleId
                    ? articleMap.get(articleId)
                    : undefined;
                  const index =
                    typeof indexAttr === 'number'
                      ? indexAttr
                      : indexAttr !== undefined
                        ? Number(indexAttr)
                        : undefined;
                  // index fallback only active when ID tokens are absent (prevent mis-linking)
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
                          className="bg-primary/15 text-primary hover:bg-primary/25 ml-2 inline-flex h-7 items-center rounded-full transition-colors"
                          title={
                            article.translatedTitle?.trim()
                              ? article.translatedTitle
                              : article.title
                          }
                        >
                          <Link
                            data-testid="agent-article-link"
                            href={`/articles/${encodeURIComponent(article.articleId)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Link2 className="mr-1 h-3 w-3" />
                            {article.translatedTitle?.trim()
                              ? article.translatedTitle
                              : article.title}
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
    </>
  );
}
