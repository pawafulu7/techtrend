'use client';

import { useState } from 'react';
import { AgentSearchBar } from './agent-search-bar';

export function AgentSearchClient() {
  const [currentQuery, setCurrentQuery] = useState('');

  const handleSearch = (query: string) => {
    console.log('[Phase 2a] Search triggered:', query);
    setCurrentQuery(query);
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">AI記事検索</h1>
      <AgentSearchBar onSearch={handleSearch} />

      {currentQuery && (
        <div className="mt-8 p-4 bg-muted rounded-md">
          <p className="text-sm text-muted-foreground">
            Phase 2a: Search triggered for &quot;{currentQuery}&quot;
          </p>
        </div>
      )}
    </div>
  );
}
