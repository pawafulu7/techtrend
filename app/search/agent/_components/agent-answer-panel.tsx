'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
import { Badge } from '@/components/ui/badge';
import type { AgentSearchResult } from '@/lib/hooks/useAgentSearch';

interface AgentAnswerPanelProps {
  result: AgentSearchResult;
  onFeedback?: (positive: boolean) => void;
}

export function AgentAnswerPanel({ result, onFeedback }: AgentAnswerPanelProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    try {
      // レンダリング後のテキスト（トークン除去済み）を取得
      const root = document.querySelector('[data-testid="agent-answer-markdown"]');
      const copyText = root?.textContent ?? result.response;

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

  const articleMap = useMemo(() => {
    const articles = result.articles ?? [];
    return new Map(articles.map((article) => [article.articleId, article]));
  }, [result.articles]);

  // 応答に [#...] トークンが含まれるか（通常は true、フォールバック時は false）
  const hasEmbeddedIds = useMemo(() => /\[#\S+?\]/.test(result.response), [result.response]);

  // トップレベル制御用の Context（0: ルート、1以上: ネスト）
  const ListDepthContext = React.createContext(0);

  type MarkdownLi = React.ReactElement<
    React.ComponentPropsWithoutRef<'li'> & { 'data-article-index'?: string }
  >;

  const isMarkdownLi = (node: React.ReactNode): node is MarkdownLi =>
    React.isValidElement(node) && node.type === 'li';

  // ol renderer component (for ListDepthContext hook usage)
  const OlComponent = ({ children, ...props }: React.ComponentPropsWithoutRef<'ol'>) => {
    const depth = React.useContext(ListDepthContext);
    return (
      <ListDepthContext.Provider value={depth + 1}>
        <ol {...props}>
          {React.Children.map(children, (child, index) => {
            if (!isMarkdownLi(child)) return child;
            // トップレベル（depth===0）かつトークン不在時のみ index 付与
            return hasEmbeddedIds || depth > 0
              ? child
              : React.cloneElement(child, { 'data-article-index': String(index) });
          })}
        </ol>
      </ListDepthContext.Provider>
    );
  };

  return (
    <div className="bg-card border rounded-lg shadow-sm p-6" role="article" aria-labelledby="answer-heading">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 id="answer-heading" className="text-lg font-semibold">
            AI回答
          </h2>
          {result.cached && (
            <Badge variant="secondary" className="text-xs">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              キャッシュ
            </Badge>
          )}
          {result.fallback && (
            <Badge variant="destructive" className="text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" />
              フォールバック
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-8 w-8 p-0"
            aria-label="回答をコピー"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {result.fallback && (
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            AI検索が一時的に利用できないため、通常の検索結果を表示しています
          </p>
        </div>
      )}

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
                !articleId && !hasEmbeddedIds && typeof index === 'number' && Number.isFinite(index)
                  ? result.articles?.[index]
                  : undefined;
              const article = articleFromId ?? articleFromIndex ?? null;

              return (
                <li {...props}>
                  {children}
                  {article && (
                    <Button
                      asChild
                      size="sm"
                      className="ml-2 h-7 rounded-full bg-primary/15 text-primary hover:bg-primary/25 transition-colors inline-flex items-center"
                      title={
                        article.translatedTitle?.trim() ? article.translatedTitle : article.title
                      }
                    >
                      <Link
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
            {result.response}
          </ReactMarkdown>
        </ListDepthContext.Provider>
      </div>


      <div className="flex items-center justify-between pt-4 border-t mt-4">
        <div className="text-xs text-muted-foreground">
          {result.usage?.totalTokens && (
            <span>トークン使用: {result.usage.totalTokens.toLocaleString()}</span>
          )}
        </div>

        {onFeedback && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground mr-2">この回答は役立ちましたか？</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onFeedback(true)}
              className="h-7 w-7 p-0"
              aria-label="良い"
            >
              <ThumbsUp className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onFeedback(false)}
              className="h-7 w-7 p-0"
              aria-label="悪い"
            >
              <ThumbsDown className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
