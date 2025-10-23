'use client';

import { useState, useCallback } from 'react';

export interface AgentSearchResult {
  query: string;
  response: string;
  toolCalls: Array<{ id: string; name: string; input: unknown; dynamic: boolean }>;
  usage: { totalTokens: number; promptTokens?: number; completionTokens?: number };
  cached: boolean;
  fallback: boolean;
}

export interface AgentSearchError {
  status: number;
  message: string;
  details?: unknown;
  retryAfter?: number;
}

export interface UseAgentSearchOptions {
  onSuccess?: (data: AgentSearchResult) => void;
  onError?: (error: AgentSearchError) => void;
}

export interface UseAgentSearchReturn {
  search: (query: string) => Promise<void>;
  result: AgentSearchResult | null;
  error: AgentSearchError | null;
  isLoading: boolean;
  reset: () => void;
}

export function useAgentSearch(options?: UseAgentSearchOptions): UseAgentSearchReturn {
  const [result, setResult] = useState<AgentSearchResult | null>(null);
  const [error, setError] = useState<AgentSearchError | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const search = useCallback(
    async (_query: string) => {
      throw new Error('Not implemented - Phase 3');
    },
    []
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    search,
    result,
    error,
    isLoading,
    reset,
  };
}
