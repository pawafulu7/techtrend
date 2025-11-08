'use client';

import { useState, useEffect } from 'react';
import { AgentSearchBar } from './agent-search-bar';
import { AgentLoadingState } from './agent-loading-state';
import { AgentAnswerPanel } from './agent-answer-panel';
import { AgentErrorDisplay } from './agent-error-display';
import { useAgentSearch } from '@/lib/hooks/useAgentSearch';

const ENABLE_STREAMING_UI = process.env.NEXT_PUBLIC_ENABLE_AGENT_STREAMING_UI === 'true';

export function AgentSearchClient() {
  const [lastQuery, setLastQuery] = useState('');
  const [showResult, setShowResult] = useState(false);
  const { search, result, error, isLoading, partialText, reset } = useAgentSearch();

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

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">AI記事検索</h1>

      <AgentSearchBar onSearch={handleSearch} isLoading={isLoading} />

      <div className="mt-8">
        {isLoading && !(ENABLE_STREAMING_UI && partialText) && <AgentLoadingState />}
        {!isLoading && showResult && error && <AgentErrorDisplay error={error} onRetry={handleRetry} />}
        {showResult && (result || (ENABLE_STREAMING_UI && partialText)) && !error && (
          <AgentAnswerPanel
            result={result}
            partialText={ENABLE_STREAMING_UI ? partialText : null}
            isStreaming={ENABLE_STREAMING_UI && Boolean(partialText && !result)}
            onFeedback={handleFeedback}
          />
        )}
      </div>
    </div>
  );
}
