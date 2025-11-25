'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { AgentSearchBar } from './agent-search-bar';
import { AgentSampleQueries } from './agent-sample-queries';
import { AgentLoadingState } from './agent-loading-state';
import { AgentAnswerPanel } from './agent-answer-panel';
import { AgentErrorDisplay } from './agent-error-display';
import { useAgentSearch } from '@/lib/hooks/useAgentSearch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { ButtonV2 } from '@/components/ui-v2/button-v2';

const ENABLE_STREAMING_UI = process.env.NEXT_PUBLIC_ENABLE_AGENT_STREAMING_UI !== 'false';

export function AgentSearchClient() {
  const [lastQuery, setLastQuery] = useState('');
  const [showResult, setShowResult] = useState(false);
  const { search, result, error, isLoading, partialText, reset } = useAgentSearch();
  const prefillQueryRef = useRef<((query: string) => void) | null>(null);

  const handleSearch = async (query: string) => {
    setLastQuery(query);
    setShowResult(false);
    reset();
    await search(query);
  };

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
    setShowResult(false);
    reset();
    search(lastQuery);
  };

  const handleFeedback = (positive: boolean) => {
    console.log('[Feedback]', positive ? 'positive' : 'negative', 'for query:', result?.query || lastQuery);
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

  return (
    <div>
      <CardV2
        variant="default"
        className="bg-(--tt-color-surface-muted) shadow-[var(--tt-shadow-card-rest)] p-6 mb-6"
        data-testid="agent-search-card"
      >
        <div className="text-center mb-4">
          <h1 className="text-2xl font-heading mb-2">AI記事検索</h1>
          <p className="text-sm text-(--tt-color-text-muted)">
            AIがTechTrendの記事を横断検索し、要約と参考リンクで回答します。気になるテーマを自然言語で質問してください。
          </p>
        </div>

        <AgentSearchBar
          onSearch={handleSearch}
          isLoading={isLoading}
          onPrefillQuery={handleSetPrefillCallback}
        />
      </CardV2>

      <Collapsible className="mt-4">
        <CollapsibleTrigger asChild>
          <ButtonV2
            variant="ghost"
            size="sm"
            className="w-full justify-center gap-2"
            data-testid="agent-sample-query-trigger"
          >
            <span className="text-sm">よくある質問を見る</span>
            <ChevronDown className="h-4 w-4 transition-transform duration-200" />
          </ButtonV2>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4">
          <CardV2 variant="ghost" className="p-4">
            <AgentSampleQueries onSelectQuery={handlePrefillQuery} />
          </CardV2>
        </CollapsibleContent>
      </Collapsible>

      <div className="mt-8">
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
