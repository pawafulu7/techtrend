'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ChevronDown, X, MessageSquare } from 'lucide-react';
import { AgentSearchBar } from '@/app/search/agent/_components/agent-search-bar';
import { AgentSampleQueries } from '@/app/search/agent/_components/agent-sample-queries';
import { AgentLoadingState } from '@/app/search/agent/_components/agent-loading-state';
import { AgentAnswerPanel } from '@/app/search/agent/_components/agent-answer-panel';
import { AgentErrorDisplay } from '@/app/search/agent/_components/agent-error-display';
import { useArticleQA } from '@/lib/hooks/useArticleQA';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';

const ENABLE_STREAMING_UI = process.env.NEXT_PUBLIC_ENABLE_AGENT_STREAMING_UI !== 'false';

export interface ArticleQAClientProps {
  articleId: string;
  articleTitle: string;
  articleSummary?: string;
  articleTopics?: string[];
  locale?: 'ja' | 'en';
  onClose?: () => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
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
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const { search, result, error, isLoading, partialText, contextChunk, reset } = useArticleQA({
    articleId,
    articleTitle,
    locale,
  });
  const prefillQueryRef = useRef<((query: string) => void) | null>(null);

  const handleSearch = useCallback(
    async (query: string) => {
      setLastQuery(query);
      setShowResult(false);
      setConversation([
        { id: `user-${Date.now()}`, role: 'user', content: query },
        { id: `assistant-${Date.now()}`, role: 'assistant', content: '' },
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

  const handleRetry = () => {
    if (!lastQuery) return;
    void handleSearch(lastQuery);
  };

  const handleFeedback = (positive: boolean) => {
    console.log('[Article QA Feedback]', positive ? 'positive' : 'negative', result?.query || lastQuery);
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
    <div>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm text-muted-foreground mb-1">TechTrend Article QA</p>
          <h1 className="text-2xl font-bold">{displayTitle}</h1>
          {displaySnippet && (
            <p className="text-sm text-muted-foreground mt-2 line-clamp-2" data-testid="article-snippet">
              {displaySnippet}
            </p>
          )}
          {!displaySnippet && (
            <p className="text-sm text-muted-foreground mt-2">
              記事について知りたいことを自然言語で質問してください。AIが文脈に沿って回答します。
            </p>
          )}
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="sm"
            className="self-end md:self-start"
            onClick={onClose}
            aria-label="記事QAパネルを閉じる"
          >
            <X className="h-4 w-4 mr-2" />
            閉じる
          </Button>
        )}
      </div>

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

      <Collapsible className="mt-4">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-center gap-2">
            <span className="text-sm">質問例を見てみる</span>
            <ChevronDown className="h-4 w-4 transition-transform duration-200" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4">
          <AgentSampleQueries onSelectQuery={handlePrefillQuery} queries={sampleQueries} />
        </CollapsibleContent>
      </Collapsible>

      <div className="mt-8 space-y-4">
        {conversation
          .filter((message) => message.role === 'user')
          .map((message) => (
            <div key={message.id} className="flex justify-end">
              <div className="max-w-2xl rounded-2xl bg-primary text-primary-foreground px-4 py-3 text-sm shadow">
                {message.content}
              </div>
            </div>
          ))}

        {isLoading && !isStreamingWithPartialText && <AgentLoadingState />}
        {!isLoading && showResult && error && <AgentErrorDisplay error={error} onRetry={handleRetry} />}
        {showResult && (result || isStreamingWithPartialText) && !error && (
          <AgentAnswerPanel
            result={result}
            partialText={ENABLE_STREAMING_UI ? partialText : null}
            isStreaming={shouldShowStreamingResult}
            onFeedback={handleFeedback}
          />
        )}
      </div>
    </div>
  );
}
