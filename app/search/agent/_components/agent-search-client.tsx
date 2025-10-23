'use client';

import { useState } from 'react';
import { AgentSearchBar } from './agent-search-bar';
import { AgentLoadingState } from './agent-loading-state';
import { AgentAnswerPanel } from './agent-answer-panel';
import type { AgentSearchResult } from '@/lib/hooks/useAgentSearch';

const MOCK_RESULT: AgentSearchResult = {
  query: 'terraformについての記事をおすすめ5件教えて',
  response: `以下は、Terraformに関するおすすめの5件の記事です:

1. **BT Group、HashiCorp製品を活用しクラウド移行を推進** (一致度: 41.8%)
   - BT GroupがHashiCorp製品を活用し、大規模なクラウド移行を実施
   - 公開日: 2025年9月8日

2. **Terraformでインフラ管理を自動化する方法** (一致度: 45.2%)
   - IaCツールとしてのTerraformの活用事例
   - 公開日: 2025年8月15日

3. **AWS環境でのTerraform実践ガイド** (一致度: 43.5%)
   - AWSリソースをTerraformで管理する具体的手順
   - 公開日: 2025年7月22日`,
  toolCalls: [
    { id: '1', name: 'semantic_search', input: { query: 'terraform', topK: 10 }, dynamic: false },
  ],
  usage: { totalTokens: 2873, promptTokens: 1200, completionTokens: 1673 },
  cached: false,
  fallback: false,
};

export function AgentSearchClient() {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AgentSearchResult | null>(null);

  const handleSearch = (searchQuery: string) => {
    setQuery(searchQuery);
    setResult(null);
    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      setResult({ ...MOCK_RESULT, query: searchQuery });
    }, 5000);
  };

  const handleFeedback = (positive: boolean) => {
    console.log('[Phase 2b] Feedback:', positive ? 'positive' : 'negative', 'for query:', query);
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">AI記事検索</h1>

      <AgentSearchBar onSearch={handleSearch} isLoading={isLoading} />

      <div className="mt-8">
        {isLoading && <AgentLoadingState />}
        {result && !isLoading && (
          <AgentAnswerPanel result={result} onFeedback={handleFeedback} />
        )}
      </div>
    </div>
  );
}
