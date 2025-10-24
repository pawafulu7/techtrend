'use client';

import { useState } from 'react';
import { AgentSearchBar } from './agent-search-bar';
import { AgentLoadingState } from './agent-loading-state';
import { AgentAnswerPanel } from './agent-answer-panel';
import { AgentErrorDisplay } from './agent-error-display';
import { useAgentSearch } from '@/lib/hooks/useAgentSearch';

export function AgentSearchClient() {
  const [lastQuery, setLastQuery] = useState('');
  const { search, result, error, isLoading, reset } = useAgentSearch();

  const handleSearch = async (query: string) => {
    setLastQuery(query);
    reset();
    await search(query);
  };

  const handleRetry = () => {
    if (lastQuery) {
      search(lastQuery);
    }
  };

  const handleFeedback = (positive: boolean) => {
    console.log('[Feedback]', positive ? 'positive' : 'negative', 'for query:', result?.query || lastQuery);
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">AI記事検索</h1>

      <AgentSearchBar onSearch={handleSearch} isLoading={isLoading} />

      <div className="mt-8">
        {isLoading && <AgentLoadingState />}
        {error && <AgentErrorDisplay error={error} onRetry={handleRetry} />}
        {result && !error && !isLoading && (
          <AgentAnswerPanel result={result} onFeedback={handleFeedback} />
        )}
      </div>
    </div>
  );
}
