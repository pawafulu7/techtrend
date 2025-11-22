'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ArrowUpRight, MessageSquare, Sparkles, Tag, X } from 'lucide-react';
import { AgentSearchBar } from '@/app/search/agent/_components/agent-search-bar';
import { AgentLoadingState } from '@/app/search/agent/_components/agent-loading-state';
import { AgentAnswerPanel } from '@/app/search/agent/_components/agent-answer-panel';
import { AgentErrorDisplay } from '@/app/search/agent/_components/agent-error-display';
import { useArticleQA, type ArticleQAResult, type ArticleQAError } from '@/lib/hooks/useArticleQA';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const ENABLE_STREAMING_UI = process.env.NEXT_PUBLIC_ENABLE_AGENT_STREAMING_UI !== 'false';

export interface ArticleQAClientProps {
  articleId: string;
  articleTitle: string;
  articleSummary?: string;
  articleTopics?: string[];
  locale?: 'ja' | 'en';
  onClose?: () => void;
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
  const preferred = sentences.find((sentence) => sentence.length >= 12 && sentence.length <= 80);
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
    sampleQueries.add(`What prerequisites should I know before reading "${safeTitle}"?`);
    if (focus) {
      sampleQueries.add(`The article mentions "${focus}". Can you explain that section in detail?`);
    }
    if (primaryTopic) {
      sampleQueries.add(`Why is ${primaryTopic} considered useful in this article?`);
    }
    if (secondaryTopic) {
      sampleQueries.add(`What are the implementation cautions for ${secondaryTopic}?`);
    }
    sampleQueries.add(`Summarize the benefits and trade-offs discussed in "${safeTitle}".`);
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
}: ArticleQAClientProps) {
  const [lastQuery, setLastQuery] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [chatHistory, setChatHistory] = useState<QAExchange[]>([]);
  const [activeExchangeId, setActiveExchangeId] = useState<string | null>(null);
  const { search, result, error, isLoading, partialText, contextChunk, reset } = useArticleQA({
    articleId,
    articleTitle,
    locale,
  });
  const prefillQueryRef = useRef<((query: string) => void) | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const handleSearch = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;

      setLastQuery(query);
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
    setShowResult(true);
  }, [partialText]);

  useEffect(() => {
    if (!isLoading && (result || error)) {
      if (ENABLE_STREAMING_UI) {
        setShowResult(true);
        return;
      }

      const timer = setTimeout(() => {
        setShowResult(true);
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [isLoading, result, error]);

  useEffect(() => {
    const container = chatScrollRef.current;
    if (!container) return;
    const behavior: ScrollBehavior = chatHistory.length > 1 ? 'smooth' : 'auto';
    requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior,
      });
    });
  }, [chatHistory, partialText, showResult, isLoading, error]);

  useEffect(() => {
    if (!result || !activeExchangeId) return;
    setChatHistory((previous) =>
      previous.map((exchange) =>
        exchange.id === activeExchangeId ? { ...exchange, answer: result, error: null } : exchange
      )
    );
  }, [result, activeExchangeId]);

  useEffect(() => {
    if (!error || !activeExchangeId) return;
    setChatHistory((previous) =>
      previous.map((exchange) => (exchange.id === activeExchangeId ? { ...exchange, error } : exchange))
    );
  }, [error, activeExchangeId]);

  const handleFeedback = (positive: boolean, queryOverride?: string) => {
    const originQuery = queryOverride ?? result?.query ?? lastQuery;
    console.log('[Article QA Feedback]', positive ? 'positive' : 'negative', originQuery);
  };

  const handlePrefillQuery = useCallback((query: string) => {
    if (prefillQueryRef.current) {
      prefillQueryRef.current(query);
    }
  }, []);

  const handleSetPrefillCallback = useCallback((callback: (query: string) => void) => {
    prefillQueryRef.current = callback;
  }, []);

  const isStreamingWithPartialText = ENABLE_STREAMING_UI && Boolean(partialText);
  const shouldShowStreamingResult = ENABLE_STREAMING_UI && Boolean(partialText && !result);
  const normalizedTopics = useMemo(
    () => (articleTopics ?? []).filter((topic): topic is string => Boolean(topic && topic.trim())),
    [articleTopics]
  );
  const displayTitle = contextChunk?.title ?? articleTitle;
  const displaySnippet = contextChunk?.snippet ?? articleSummary;

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

  const shortcutHint =
    locale === 'ja' ? (
      <>
        ショートカット: <kbd className="px-1 py-0.5 bg-muted rounded">Cmd+Shift+K</kbd> または{' '}
        <kbd className="px-1 py-0.5 bg-muted rounded">Ctrl+Shift+K</kbd> で質問欄を開く
      </>
    ) : (
      <>
        Shortcut: <kbd className="px-1 py-0.5 bg-muted rounded">Cmd+Shift+K</kbd> or{' '}
        <kbd className="px-1 py-0.5 bg-muted rounded">Ctrl+Shift+K</kbd> to focus the question box
      </>
    );

  return (
    <section className="space-y-6">
      <div className="relative isolate overflow-hidden rounded-[32px] border border-slate-100 bg-gradient-to-br from-indigo-50 via-white to-sky-50 px-5 py-7 shadow-[0_45px_90px_-50px_rgba(15,23,42,0.7)] sm:px-8">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-sky-200/60 blur-[120px]" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-64 w-64 rounded-full bg-indigo-100/70 blur-[120px]" />

        <div className="relative z-10 space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600 shadow-sm">
                <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                TechTrend Article QA
              </div>
              <h1 className="text-3xl font-bold leading-tight text-slate-900">{displayTitle}</h1>
              {displaySnippet ? (
                <p className="text-sm text-slate-600 md:text-base" data-testid="article-snippet">
                  {displaySnippet}
                </p>
              ) : (
                <p className="text-sm text-slate-600 md:text-base">
                  記事に関する疑問を入力すると、該当箇所を引用した丁寧な回答が得られます。
                </p>
              )}
            </div>
            {onClose && (
              <Button
                variant="outline"
                size="sm"
                className="self-start rounded-full border-white/70 bg-white/80 text-slate-600 shadow-sm transition hover:shadow"
                onClick={onClose}
                aria-label="記事QAパネルを閉じる"
              >
                <X className="h-4 w-4 mr-2" />
                {locale === 'ja' ? '閉じる' : 'Close'}
              </Button>
            )}
          </div>

          {normalizedTopics.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {normalizedTopics.map((topic) => (
                <Badge
                  key={topic}
                  variant="secondary"
                  className="gap-1 rounded-full border border-white/60 bg-white/80 px-3 py-1 text-xs font-medium text-slate-600"
                >
                  <Tag className="h-3 w-3 text-indigo-500" />
                  {topic}
                </Badge>
              ))}
            </div>
          )}

        </div>
      </div>

      <div className="rounded-[32px] border border-slate-100 bg-white px-4 py-6 shadow-[0_40px_90px_-60px_rgba(15,23,42,0.85)] sm:px-8 sm:py-8">
        <div className="mb-6 flex flex-col gap-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
            <MessageSquare className="h-4 w-4 text-indigo-500" />
            {locale === 'ja' ? 'チャットタイムライン' : 'Conversation'}
          </div>
          <p className="text-sm text-muted-foreground">
            {locale === 'ja'
              ? '質問内容とAIの回答がカード形式で表示されます。引用には記事ソースが含まれます。'
              : 'Your prompts and grounded answers render below with contextual citations.'}
          </p>
        </div>

        <div className="relative flex flex-col gap-6">
          <div
            ref={chatScrollRef}
            className="flex-1 space-y-5 overflow-y-auto pr-1 max-h-[65vh] pb-36"
          >
            {chatHistory.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200/80 bg-slate-50/80 p-6 text-sm text-slate-500">
                {locale === 'ja'
                  ? '質問を入力すると、ここにチャット履歴が表示されます。'
                  : 'Start asking questions to build your chat history here.'}
              </div>
            ) : (
              chatHistory.map((exchange) => {
                const isActive = exchange.id === activeExchangeId;
                const exchangeResult = isActive ? result ?? exchange.answer : exchange.answer;
                const showAnswerPanel = Boolean(
                  exchangeResult ||
                    (isActive &&
                      (shouldShowStreamingResult ||
                        (showResult && (result || (ENABLE_STREAMING_UI ? partialText : null)))))
                );
                const streamingPartial = isActive && ENABLE_STREAMING_UI ? partialText : null;
                const showLoading = isActive && isLoading && !isStreamingWithPartialText;

                return (
                  <div key={exchange.id} className="space-y-3">
                    <div className="flex justify-end">
                      <div className="max-w-2xl rounded-3xl bg-gradient-to-r from-indigo-500 via-violet-500 to-sky-500 px-5 py-3 text-sm font-medium text-white shadow-lg shadow-indigo-200/60">
                        {exchange.question}
                      </div>
                    </div>

                    {showLoading && (
                      <div className="rounded-2xl border border-slate-100/80 bg-slate-50/80 p-4">
                        <AgentLoadingState />
                      </div>
                    )}

                    {exchange.error && (
                      <div className="rounded-2xl border border-red-100 bg-red-50/80 p-4">
                        <AgentErrorDisplay
                          error={exchange.error}
                          onRetry={() => {
                            void handleSearch(exchange.question);
                          }}
                        />
                      </div>
                    )}

                    {!exchange.error && showAnswerPanel && (
                      <div className="rounded-[28px] border border-slate-100/80 bg-gradient-to-b from-white to-slate-50/70 p-1.5 shadow-[0_30px_80px_-60px_rgba(15,23,42,0.7)]">
                        <AgentAnswerPanel
                          result={exchangeResult}
                          partialText={streamingPartial}
                          isStreaming={isActive && shouldShowStreamingResult}
                          onFeedback={(positive) =>
                            handleFeedback(positive, exchangeResult?.query ?? exchange.question)
                          }
                        />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="sticky bottom-0 left-0 right-0 bg-gradient-to-b from-transparent via-white to-white pt-6">
            <div className="rounded-[28px] border border-slate-100/80 bg-white/90 p-4 shadow-[0_30px_80px_-60px_rgba(15,23,42,0.7)] backdrop-blur-sm sm:p-6">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">
                <MessageSquare className="h-4 w-4 text-indigo-500" />
                {locale === 'ja' ? 'この記事に質問する' : 'Ask this article'}
              </div>
              <div className="mt-4">
                <AgentSearchBar
                  onSearch={handleSearch}
                  isLoading={isLoading}
                  onPrefillQuery={handleSetPrefillCallback}
                  badgeLabel={locale === 'ja' ? '記事Q&A' : 'Article Q&A'}
                  badgeIcon={<MessageSquare className="h-3 w-3 mr-1" />}
                  helperText={helperText}
                  placeholder={placeholder}
                  submitLabel={locale === 'ja' ? '質問' : 'Ask'}
                  loadingLabel={locale === 'ja' ? '回答中' : 'Answering'}
                  historyEnabled={false}
                  inputLabel={locale === 'ja' ? '記事QA質問入力' : 'Article QA question input'}
                  shortcutHint={shortcutHint}
                />
              </div>

              <div className="mt-6">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                  <Sparkles className="h-4 w-4 text-indigo-500" />
                  {locale === 'ja' ? '質問のヒント' : 'Sample questions'}
                </div>
                <div className="mt-3 flex flex-wrap gap-3">
                  {sampleQueries.map((query) => (
                    <button
                      key={query}
                      type="button"
                      aria-label={query}
                      onClick={() => handlePrefillQuery(query)}
                      className="group inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:text-indigo-600 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
                    >
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-50 text-[11px] font-semibold text-indigo-600 transition group-hover:bg-indigo-100">
                        Q
                      </span>
                      <span className="text-left">{query}</span>
                      <ArrowUpRight className="h-4 w-4 text-slate-300 transition group-hover:text-indigo-400" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
