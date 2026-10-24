'use client';

import { useState, useEffect, useRef, useCallback, useMemo, useId } from 'react';
import { Bot, MessageSquare, Sparkles, User, X } from 'lucide-react';
import { AgentSearchBar } from '@/app/search/agent/_components/agent-search-bar';
import { AgentLoadingState } from '@/app/search/agent/_components/agent-loading-state';
import { ArticleQaAnswer } from './article-qa-answer';
import { preloadMarkdown } from '@/app/components/common/lazy-markdown';
import { AgentErrorDisplay } from '@/app/search/agent/_components/agent-error-display';
import {
  useArticleQA,
  type ArticleQAResult,
  type ArticleQAError,
} from '@/lib/hooks/useArticleQA';
import { Button } from '@/components/ui-v2/button-v2';

const ENABLE_STREAMING_UI =
  process.env.NEXT_PUBLIC_ENABLE_AGENT_STREAMING_UI !== 'false';

export interface ArticleQAClientProps {
  articleId: string;
  articleTitle: string;
  articleSummary?: string;
  articleTopics?: string[];
  locale?: 'ja' | 'en';
  onClose?: () => void;
  /** 開いたときに質問欄へフォーカスを移す */
  autoFocus?: boolean;
}

interface QAExchange {
  id: string;
  question: string;
  answer: ArticleQAResult | null;
  error?: ArticleQAError | null;
  timestamp: number;
}

function normalizeText(value?: string): string {
  return value ? value.replace(/\s+/g, ' ').trim() : '';
}

function selectSummaryFocus(summary?: string): string | null {
  const normalized = normalizeText(summary);
  if (!normalized) return null;
  const sentences = normalized
    .split(/[。.!?]/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (sentences.length === 0) {
    return normalized.slice(0, 80);
  }
  const preferred = sentences.find(
    (sentence) => sentence.length >= 12 && sentence.length <= 80
  );
  return (preferred ?? sentences[0]).slice(0, 80);
}

function buildArticleSampleQueries(options: {
  title: string;
  summary?: string;
  topics: string[];
  locale: 'ja' | 'en';
}): string[] {
  const { title, summary, topics, locale } = options;
  const sampleQueries = new Set<string>();
  const focus = selectSummaryFocus(summary);
  const safeTitle = title.trim();
  const [primaryTopic, secondaryTopic] = topics;

  if (locale === 'en') {
    sampleQueries.add(`Give me the key takeaways from "${safeTitle}".`);
    sampleQueries.add(
      `What prerequisites should I know before reading "${safeTitle}"?`
    );
    if (focus) {
      sampleQueries.add(
        `The article mentions "${focus}". Can you explain that section in detail?`
      );
    }
    if (primaryTopic) {
      sampleQueries.add(
        `Why is ${primaryTopic} considered useful in this article?`
      );
    }
    if (secondaryTopic) {
      sampleQueries.add(
        `What are the implementation cautions for ${secondaryTopic}?`
      );
    }
    sampleQueries.add(
      `Summarize the benefits and trade-offs discussed in "${safeTitle}".`
    );
    return Array.from(sampleQueries).slice(0, 5);
  }

  sampleQueries.add(`「${safeTitle}」の要点を3行で教えて`);
  sampleQueries.add(`「${safeTitle}」を理解するための前提知識は？`);
  if (focus) {
    sampleQueries.add(`要約で触れられていた「${focus}」について詳しく教えて`);
  }
  if (primaryTopic) {
    sampleQueries.add(`この記事で${primaryTopic}が便利になる理由は？`);
  }
  if (secondaryTopic) {
    sampleQueries.add(`${secondaryTopic}を実装する際の注意点は？`);
  }
  sampleQueries.add(`この記事で提案されている課題と解決策を整理して`);
  return Array.from(sampleQueries).slice(0, 5);
}

export function ArticleQAClient({
  articleId,
  articleTitle,
  articleSummary,
  articleTopics,
  locale = 'ja',
  onClose,
  autoFocus = false,
}: ArticleQAClientProps) {
  const headingId = useId();
  const [showResult, setShowResult] = useState(false);
  const [chatHistory, setChatHistory] = useState<QAExchange[]>([]);
  const [activeExchangeId, setActiveExchangeId] = useState<string | null>(null);
  const [sampleQueriesOpen, setSampleQueriesOpen] = useState(true);
  const [hasSentFirstMessage, setHasSentFirstMessage] = useState(false);
  const { search, result, error, isLoading, partialText, reset } = useArticleQA(
    {
      articleId,
      articleTitle,
      locale,
    }
  );
  const prefillQueryRef = useRef<((query: string) => void) | null>(null);
  const latestQuestionRef = useRef<HTMLDivElement | null>(null);

  const handleSearch = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;

      preloadMarkdown();
      setShowResult(false);
      const timestamp = Date.now();
      const exchangeId = `qa-${timestamp}`;
      setActiveExchangeId(exchangeId);
      setChatHistory((previous) => [
        ...previous,
        {
          id: exchangeId,
          question: query,
          answer: null,
          error: null,
          timestamp,
        },
      ]);
      reset();
      await search(query);
    },
    [reset, search]
  );

  useEffect(() => {
    if (!ENABLE_STREAMING_UI) return;
    if (!partialText) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: show result when streaming starts
    setShowResult(true);
  }, [partialText]);

  useEffect(() => {
    if (!isLoading && (result || error)) {
      if (ENABLE_STREAMING_UI) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: show result when loading completes
        setShowResult(true);
        return;
      }

      const timer = setTimeout(() => {
        setShowResult(true);
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [isLoading, result, error]);

  // 質問を送ったら、その質問を画面に入れる。パネルはページの中にあるので、回答の生成中に
  // スクロールを追いかけると本文を読んでいる位置が動いてしまう。追うのは質問を足したときだけにする
  useEffect(() => {
    if (chatHistory.length === 0) return;
    requestAnimationFrame(() => {
      latestQuestionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    });
  }, [chatHistory.length]);

  useEffect(() => {
    if (!result || !activeExchangeId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: update chat history with result
    setChatHistory((previous) =>
      previous.map((exchange) =>
        exchange.id === activeExchangeId
          ? { ...exchange, answer: result, error: null }
          : exchange
      )
    );
  }, [result, activeExchangeId]);

  useEffect(() => {
    if (!error || !activeExchangeId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: update chat history with error
    setChatHistory((previous) =>
      previous.map((exchange) =>
        exchange.id === activeExchangeId ? { ...exchange, error } : exchange
      )
    );
  }, [error, activeExchangeId]);

  // Auto-collapse sample queries after first message is sent
  useEffect(() => {
    if (!hasSentFirstMessage && chatHistory.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: collapse queries after first message
      setSampleQueriesOpen(false);
      setHasSentFirstMessage(true);
    }
  }, [chatHistory.length, hasSentFirstMessage]);

  const handlePrefillQuery = useCallback((query: string) => {
    if (prefillQueryRef.current) {
      prefillQueryRef.current(query);
    }
  }, []);

  const handleSetPrefillCallback = useCallback(
    (callback: (query: string) => void) => {
      prefillQueryRef.current = callback;
    },
    []
  );

  const isStreamingWithPartialText =
    ENABLE_STREAMING_UI && Boolean(partialText);
  const shouldShowStreamingResult =
    ENABLE_STREAMING_UI && Boolean(partialText && !result);
  const normalizedTopics = useMemo(
    () =>
      (articleTopics ?? []).filter((topic): topic is string =>
        Boolean(topic && topic.trim())
      ),
    [articleTopics]
  );

  const helperText =
    locale === 'ja'
      ? '記事の内容について気になる点を質問してください。AIが該当箇所を引用して回答します。'
      : 'Ask any question about this article. The assistant will answer with grounded citations.';

  const placeholder = useMemo(() => {
    const primaryTopic = normalizedTopics[0];
    if (locale === 'en') {
      return primaryTopic
        ? `e.g. What benefits does ${primaryTopic} provide in this article?`
        : `e.g. What benefits does "${articleTitle}" highlight?`;
    }
    if (primaryTopic) {
      return `例: ${primaryTopic}の利点や導入効果は？`;
    }
    return `例: 「${articleTitle}」で紹介されているメリットは？`;
  }, [articleTitle, normalizedTopics, locale]);

  const sampleQueries = useMemo(
    () =>
      buildArticleSampleQueries({
        title: articleTitle,
        summary: articleSummary,
        topics: normalizedTopics,
        locale,
      }),
    [articleTitle, articleSummary, normalizedTopics, locale]
  );
  const headingText =
    locale === 'ja' ? '記事について質問する' : 'Ask about this article';

  // ショートカットはキーボードのある幅だけで案内する。パネルの左端にそろえるため、検索欄の中央寄せの案内は使わない
  const shortcutHint =
    locale === 'ja' ? (
      <>
        <kbd className="bg-muted rounded px-1 py-0.5">Cmd+Shift+K</kbd> または{' '}
        <kbd className="bg-muted rounded px-1 py-0.5">Ctrl+Shift+K</kbd>{' '}
        で質問欄へ移る
      </>
    ) : (
      <>
        <kbd className="bg-muted rounded px-1 py-0.5">Cmd+Shift+K</kbd> or{' '}
        <kbd className="bg-muted rounded px-1 py-0.5">Ctrl+Shift+K</kbd> to
        focus the question box
      </>
    );

  // 記事詳細のカードと同じ1枚の枠（rounded-lg）にする。中の質問・回答・エラーも同じ角丸にそろえ、
  // サンプル質問のような押せる小さな部品だけを rounded-full にする（Issue #740）
  return (
    <section
      aria-labelledby={headingId}
      className="animate-in fade-in-0 slide-in-from-top-1 motion-reduce:animate-none rounded-lg border border-(--tt-color-border) bg-(--tt-color-surface) p-4 duration-200 sm:p-6"
      data-testid="article-qa-panel"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h2
            id={headingId}
            className="text-h3 flex items-center gap-2 text-(--tt-color-text)"
          >
            <MessageSquare
              className="h-5 w-5 shrink-0 text-(--tt-color-primary)"
              aria-hidden="true"
            />
            {headingText}
          </h2>
          <p className="text-sm text-(--tt-color-text-muted)">{helperText}</p>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-(--tt-color-text-muted)"
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden="true" />
            {locale === 'ja' ? '閉じる' : 'Close'}
          </Button>
        )}
      </div>

      {chatHistory.length > 0 && (
        <div className="mt-6 space-y-5">
          {chatHistory.map((exchange, index) => {
            const isActive = exchange.id === activeExchangeId;
            const exchangeResult = isActive
              ? (result ?? exchange.answer)
              : exchange.answer;
            const showAnswerPanel = Boolean(
              exchangeResult ||
              (isActive &&
                (shouldShowStreamingResult ||
                  (showResult &&
                    (result || (ENABLE_STREAMING_UI ? partialText : null)))))
            );
            const streamingPartial =
              isActive && ENABLE_STREAMING_UI ? partialText : null;
            const showLoading =
              isActive && isLoading && !isStreamingWithPartialText;

            return (
              <div
                key={exchange.id}
                ref={
                  index === chatHistory.length - 1
                    ? latestQuestionRef
                    : undefined
                }
                className="scroll-mt-4 space-y-3"
              >
                {/* User question bubble with User icon for color-blind accessibility */}
                <div className="flex items-start justify-end gap-3">
                  <div className="max-w-2xl rounded-lg border border-(--tt-color-border) bg-(--tt-color-surface-muted) px-4 py-3 text-sm font-medium text-(--tt-color-text)">
                    {exchange.question}
                  </div>
                  <User
                    className="mt-3 h-5 w-5 flex-shrink-0 text-(--tt-color-text-muted)"
                    aria-hidden="true"
                  />
                </div>

                {showLoading && (
                  <div className="rounded-lg border border-(--tt-color-border) bg-(--tt-color-surface-muted) p-4">
                    <AgentLoadingState />
                  </div>
                )}

                {exchange.error && (
                  <div className="rounded-lg border border-(--tt-color-negative-border) bg-(--tt-color-negative-bg) p-4">
                    <AgentErrorDisplay
                      error={exchange.error}
                      onRetry={() => {
                        void handleSearch(exchange.question);
                      }}
                    />
                  </div>
                )}

                {!exchange.error && showAnswerPanel && (
                  <div className="flex items-start gap-3">
                    <Bot
                      className="text-primary mt-5 h-5 w-5 flex-shrink-0"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <ArticleQaAnswer
                        answer={
                          streamingPartial || exchangeResult?.response || null
                        }
                        isStreaming={isActive && shouldShowStreamingResult}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* サンプル質問は質問欄のすぐ上。まだ何も聞いていないときは、これが入口になる */}
      <aside
        aria-label={locale === 'ja' ? 'サンプル質問' : 'Sample questions'}
        className="mt-6 border-t border-(--tt-color-border) pt-4"
      >
        {sampleQueriesOpen ? (
          <div
            id="sample-queries-panel"
            role="region"
            aria-label={locale === 'ja' ? '関連する質問' : 'Related questions'}
            className="space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-(--tt-color-text-muted)">
                {locale === 'ja' ? '関連する質問' : 'Related questions'}
              </span>
              <button
                type="button"
                onClick={() => setSampleQueriesOpen(false)}
                aria-expanded={sampleQueriesOpen}
                aria-controls="sample-queries-panel"
                className="focus-visible:ring-primary/30 rounded text-xs text-(--tt-color-text-muted) transition hover:text-(--tt-color-text) focus-visible:ring-2 focus-visible:outline-none"
              >
                {locale === 'ja' ? '隠す' : 'Hide'}
              </button>
            </div>
            {/* Sample query buttons - horizontal scroll on mobile, wrap on desktop */}
            <div className="scrollbar-hide -mx-1 flex gap-2 overflow-x-auto px-1 pb-2 lg:flex-wrap lg:overflow-visible">
              {sampleQueries.map((query) => (
                <button
                  key={query}
                  type="button"
                  aria-label={
                    locale === 'ja'
                      ? `サンプル質問を入力: ${query.slice(0, 20)}...`
                      : `Insert sample: ${query.slice(0, 20)}...`
                  }
                  onClick={() => handlePrefillQuery(query)}
                  className="group hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus-visible:ring-primary/30 inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-(--tt-color-border) bg-(--tt-color-surface-muted) px-2.5 py-1 text-xs text-(--tt-color-text-muted) transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none lg:flex-shrink"
                >
                  <span className="bg-primary/10 text-primary inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold">
                    Q
                  </span>
                  <span className="text-left whitespace-nowrap lg:whitespace-normal">
                    {query}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button
            id="sample-queries-toggle"
            type="button"
            onClick={() => setSampleQueriesOpen(true)}
            aria-expanded={sampleQueriesOpen}
            aria-controls="sample-queries-panel"
            className="border-primary/30 text-primary hover:bg-primary/5 focus-visible:ring-primary/30 bg-background inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {locale === 'ja' ? 'サンプル質問を表示' : 'Show sample questions'}
          </button>
        )}
      </aside>

      <div className="mt-4">
        <AgentSearchBar
          onSearch={handleSearch}
          isLoading={isLoading}
          onPrefillQuery={handleSetPrefillCallback}
          // 見出しと説明はパネルの上にあるので、検索欄のバッジは出さない
          badgeLabel=""
          placeholder={placeholder}
          submitLabel={locale === 'ja' ? '質問' : 'Ask'}
          loadingLabel={locale === 'ja' ? '回答中' : 'Answering'}
          historyEnabled={false}
          inputLabel={
            locale === 'ja' ? '記事QA質問入力' : 'Article QA question input'
          }
          shortcutHint={null}
          autoFocus={autoFocus}
          className="max-w-none"
        />
        <p className="mt-2 hidden text-xs text-(--tt-color-text-muted) sm:block">
          {shortcutHint}
        </p>
      </div>
    </section>
  );
}
