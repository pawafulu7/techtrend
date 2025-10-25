'use client';

import { useState, useEffect } from 'react';
import { AgentSearchBar } from './agent-search-bar';
import { AgentLoadingState } from './agent-loading-state';
import { AgentAnswerPanel } from './agent-answer-panel';
import { AgentErrorDisplay } from './agent-error-display';
import { useAgentSearch } from '@/lib/hooks/useAgentSearch';

export function AgentSearchClient() {
  const [lastQuery, setLastQuery] = useState('');
  const [progressOverride, setProgressOverride] = useState<number | undefined>(undefined);
  const [showResult, setShowResult] = useState(false);
  const { search, result, error, isLoading, reset } = useAgentSearch();

  const handleSearch = async (query: string) => {
    setLastQuery(query);
    setProgressOverride(undefined);
    setShowResult(false);
    reset();
    await search(query);
  };

  useEffect(() => {
    if (!isLoading && (result || error)) {
      setProgressOverride(100);

      const timer = setTimeout(() => {
        setShowResult(true);
      }, 300); // Smooth transition: allow progress bar to reach 100% before showing results

      return () => clearTimeout(timer);
    }
  }, [isLoading, result, error]);

  const handleRetry = () => {
    if (!lastQuery) return;
    setProgressOverride(undefined);
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
        {isLoading && <AgentLoadingState progress={progressOverride} />}
        {!isLoading && showResult && error && <AgentErrorDisplay error={error} onRetry={handleRetry} />}
        {!isLoading && showResult && result && !error && (
          <AgentAnswerPanel result={result} onFeedback={handleFeedback} />
        )}
      </div>
    </div>
  );
}
