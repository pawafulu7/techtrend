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
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">AI記事検索</h1>
        <p className="text-muted-foreground mb-4">
          AIがTechTrendの記事を横断検索し、要約と参考リンクで回答します。気になるテーマを自然言語で質問してください。
        </p>
      </div>

      <AgentSearchBar
        onSearch={handleSearch}
        isLoading={isLoading}
        onPrefillQuery={handleSetPrefillCallback}
      />

      <Collapsible className="mt-4">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-center gap-2">
            <span className="text-sm">よくある質問を見る</span>
            <ChevronDown className="h-4 w-4 transition-transform duration-200" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4">
          <AgentSampleQueries onSelectQuery={handlePrefillQuery} />
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
