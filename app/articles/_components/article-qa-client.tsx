'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { AgentSearchBar } from '@/app/search/agent/_components/agent-search-bar';
import { AgentSampleQueries } from '@/app/search/agent/_components/agent-sample-queries';
import { AgentLoadingState } from '@/app/search/agent/_components/agent-loading-state';
import { AgentAnswerPanel } from '@/app/search/agent/_components/agent-answer-panel';
import { AgentErrorDisplay } from '@/app/search/agent/_components/agent-error-display';
import { useArticleQA } from '@/lib/hooks/useArticleQA';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';

const ENABLE_STREAMING_UI = process.env.NEXT_PUBLIC_ENABLE_AGENT_STREAMING_UI !== 'false';

const SAMPLE_QUERIES = [
  'この記事の要点を簡単に教えて',
  'この記事の前提となる概念を教えて',
  'この手法の代替案は？',
  '実装時の注意点は？',
  'この技術の最新動向は？',
] as const;

export interface ArticleQAClientProps {
  articleId: string;
  articleTitle: string;
  locale?: 'ja' | 'en';
  onClose?: () => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export function ArticleQAClient({ articleId, articleTitle, locale = 'ja', onClose }: ArticleQAClientProps) {
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
  const displayTitle = contextChunk?.title ?? articleTitle;
  const displaySnippet = contextChunk?.snippet;

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

      <AgentSearchBar onSearch={handleSearch} isLoading={isLoading} onPrefillQuery={handleSetPrefillCallback} />

      <Collapsible className="mt-4">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-center gap-2">
            <span className="text-sm">質問例を見てみる</span>
            <ChevronDown className="h-4 w-4 transition-transform duration-200" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4">
          <AgentSampleQueries onSelectQuery={handlePrefillQuery} queries={SAMPLE_QUERIES} />
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
