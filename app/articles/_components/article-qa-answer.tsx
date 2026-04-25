'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

/**
 * ArticleQaAnswer - AI Q&A専用の回答表示コンポーネント
 *
 * AI記事検索(AgentAnswerPanel)とは異なり、以下の機能のみに特化:
 * - Markdown表示
 * - ストリーミングインジケータ
 * - 空状態表示
 *
 * 除外機能: コピー、フィードバック、トークン表示、カード表示、記事リンク装飾
 */

export interface ArticleQaAnswerProps {
  /** Markdown形式の回答テキスト（空文字列またはnullは空状態） */
  answer: string | null;
  /** ストリーミング中かどうか */
  isStreaming: boolean;
  /** テスト用ID（オプション） */
  'data-testid'?: string;
}

export function ArticleQaAnswer({
  answer,
  isStreaming,
  'data-testid': testId,
}: ArticleQaAnswerProps) {
  const hasAnswer = answer && answer.trim().length > 0;

  return (
    <article
      className="article-qa-answer border-l-primary/30 rounded-[24px] border border-l-4 border-[var(--tt-color-border)] bg-[var(--tt-color-surface)] p-5 shadow-sm sm:p-6"
      data-testid={testId}
      role="article"
      aria-label="AI回答"
    >
      {/* ストリーミングインジケータ */}
      {isStreaming && (
        <div
          data-testid="qa-streaming-indicator"
          role="status"
          aria-live="polite"
          className="bg-primary/5 mb-4 flex items-center gap-3 rounded-lg p-3"
        >
          <div className="relative flex h-3 w-3">
            <span className="bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"></span>
            <span className="bg-primary relative inline-flex h-3 w-3 rounded-full"></span>
          </div>
          <span className="text-primary/80 text-sm font-medium">
            回答を生成中...
          </span>
        </div>
      )}

      {/* Markdown表示 */}
      {hasAnswer && (
        <div
          data-testid="qa-answer-markdown"
          className="prose prose-sm prose-headings:font-semibold prose-headings:text-[var(--tt-color-text)] prose-p:text-[var(--tt-color-text)] prose-a:text-primary prose-strong:text-[var(--tt-color-text)] prose-li:text-[var(--tt-color-text)] max-w-none"
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkBreaks]}
            components={{
              a: ({ node: _node, ...props }) => (
                <a {...props} target="_blank" rel="noopener noreferrer" />
              ),
            }}
          >
            {answer}
          </ReactMarkdown>
        </div>
      )}

      {/* 空状態表示 */}
      {!isStreaming && !hasAnswer && (
        <div
          data-testid="qa-empty-state"
          role="status"
          className="text-muted-foreground py-8 text-center"
        >
          <p>回答がありません</p>
        </div>
      )}
    </article>
  );
}
