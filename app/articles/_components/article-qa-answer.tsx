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
      className="article-qa-answer rounded-[24px] border border-slate-100 bg-white p-5 sm:p-6 shadow-sm border-l-4 border-l-primary/30"
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
          className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-primary/5"
        >
          <div className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
          </div>
          <span className="text-sm text-primary/80 font-medium">
            回答を生成中...
          </span>
        </div>
      )}

      {/* Markdown表示 */}
      {hasAnswer && (
        <div
          data-testid="qa-answer-markdown"
          className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-headings:text-slate-800 prose-p:text-slate-700 prose-a:text-primary prose-strong:text-slate-800 prose-li:text-slate-700"
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
          className="text-center py-8 text-muted-foreground"
        >
          <p>回答がありません</p>
        </div>
      )}
    </article>
  );
}
