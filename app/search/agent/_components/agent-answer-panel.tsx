'use client';

import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
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
  Link2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import { ButtonV2 } from '@/components/ui-v2/button-v2';
import type { AgentSearchResult } from '@/lib/hooks/useAgentSearch';

interface AgentAnswerPanelProps {
  result: AgentSearchResult | null;
  partialText: string | null;
  isStreaming: boolean;
  onFeedback?: (positive: boolean) => void;
}

// トップレベル制御用の Context（0: ルート、1以上: ネスト）
const ListDepthContext = React.createContext(0);

export function AgentAnswerPanel({ result, partialText, isStreaming, onFeedback }: AgentAnswerPanelProps) {
  const [copied, setCopied] = useState(false);
  const [showEmptyState, setShowEmptyState] = useState(false);

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

  const articleMap = useMemo(() => {
    const safeArticles = articles ?? [];
    return new Map(safeArticles.map((article) => [article.articleId, article]));
  }, [articles]);

  const resultResponse = result?.response ?? '';
  const totalTokens = result?.usage?.totalTokens;

  // 応答に [#...] トークンが含まれるか（通常は true、フォールバック時は false）
  const hasEmbeddedIds = useMemo(() => /\[#\S+?\]/.test(resultResponse), [resultResponse]);

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
    <CardV2 variant="hover" className="p-6" role="article" aria-labelledby="answer-heading" data-testid="agent-result-card">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 id="answer-heading" className="text-lg font-semibold">
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

        <div className="flex items-center gap-1">
          <ButtonV2
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            iconOnly={true}
            className="h-7 w-7"
            aria-label="回答をコピー"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Copy className="h-4 w-4" />
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
          className="mb-4 flex items-center gap-2"
        >
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
          <span className="text-sm text-muted-foreground">AI回答を生成中...</span>
        </div>
      )}

      {showEmptyState && (
        <div className="bg-muted/50 border rounded-md p-6 text-center" role="status" aria-live="polite">
          <h3 className="text-lg font-semibold mb-2">
            {result?.fallback
              ? '関連する記事が見つかりませんでした'
              : '該当する記事が見つかりませんでした'}
          </h3>
          <p className="text-sm text-muted-foreground mb-4">以下を試してみてください:</p>
          <ul className="text-sm text-muted-foreground mb-4 text-left max-w-md mx-auto space-y-1">
            <li>• キーワードをより具体的にする（例: &quot;React&quot; → &quot;React 19のServer Components&quot;）</li>
            <li>• 技術名やバージョンを追加する</li>
            <li>• 検索期間を調整する</li>
          </ul>
          <div className="flex gap-2 justify-center">
            {/* shadcn/ui ButtonをasChildで維持: ButtonV2がasChildプロップをサポートしていないため */}
            <Button asChild variant="outline">
              <Link href="/search">通常検索を試す</Link>
            </Button>
          </div>
        </div>
      )}

      {!showEmptyState && (
        <div
          className="prose prose-sm dark:prose-invert w-full max-w-none md:max-w-3xl xl:max-w-4xl mb-4"
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
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground mr-2">この回答は役立ちましたか？</span>
            <ButtonV2
              variant="ghost"
              size="sm"
              onClick={() => onFeedback(true)}
              iconOnly={true}
              className="h-7 w-7"
              aria-label="良い"
            >
              <ThumbsUp className="h-3 w-3" />
            </ButtonV2>
            <ButtonV2
              variant="ghost"
              size="sm"
              onClick={() => onFeedback(false)}
              iconOnly={true}
              className="h-7 w-7"
              aria-label="悪い"
            >
              <ThumbsDown className="h-3 w-3" />
            </ButtonV2>
          </div>
        )}
      </div>
    </CardV2>
  );
}
